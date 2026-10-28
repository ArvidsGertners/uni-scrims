import {
  NotifChannel,
  NotifStatus,
  NotifType,
  RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOT_LOOP_STATUS_IDS,
  BOT_OFFLINE_AFTER_MS,
  NOTIFICATION_RETENTION_MS,
  OAUTH_TOKEN_MAX_AGE_MS,
  applyToRequest,
  getBotStatus,
  purgeExpiredSessions,
  purgeOldNotifications,
  purgeStaleOAuthTokens,
  recordHeartbeat,
  runSweeper,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import type * as Requests from "../src/requests.ts";
import {
  NOW,
  bookScrim,
  createOpenRequest,
  createFullyVerifiedTeam,
  createSession,
  createUser,
  uid,
  useAdmin,
} from "./helpers.ts";

// Lets a test make the expireRequests step of the sweeper fail; otherwise the real function runs.
const faults = vi.hoisted(() => ({ expireRequests: false }));

vi.mock("../src/requests.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof Requests>();
  return {
    ...actual,
    expireRequests: async (now: Date) => {
      if (faults.expireRequests) throw new Error("expireRequests failed");
      return actual.expireRequests(now);
    },
  };
});

const HOUR = 60 * 60 * 1000;

async function queueAt(createdAt: Date, status: NotifStatus) {
  const user = await createUser();
  const entityId = uid();
  await queueNotifications(prisma, createdAt, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.USER_DM,
      entityId,
      targetUserId: user.id,
      payload: { approved: true, rejectReason: null },
    },
  ]);
  const notification = await prisma.notification.findFirstOrThrow({
    where: { targetUserId: user.id },
  });
  return prisma.notification.update({ where: { id: notification.id }, data: { status } });
}

describe("purgeOldNotifications", () => {
  it("deletes entries that are no longer pending and older than 30 days", async () => {
    const old = new Date(NOW.getTime() - NOTIFICATION_RETENTION_MS - 1);
    const recent = new Date(NOW.getTime() - NOTIFICATION_RETENTION_MS + HOUR);
    const purged = await Promise.all([
      queueAt(old, NotifStatus.SENT),
      queueAt(old, NotifStatus.FAILED),
      queueAt(old, NotifStatus.CANCELLED),
    ]);
    const kept = await Promise.all([
      queueAt(old, NotifStatus.PENDING),
      queueAt(recent, NotifStatus.SENT),
      // Planned long ago, but sent only recently (after a bot outage): 30 days from the send.
      queueAt(old, NotifStatus.SENT).then((notification) =>
        prisma.notification.update({ where: { id: notification.id }, data: { sentAt: recent } }),
      ),
      // Created long ago (booked weeks ahead), failed or cancelled recently.
      ...[NotifStatus.FAILED, NotifStatus.CANCELLED].map((status) =>
        queueAt(old, status).then((notification) =>
          prisma.notification.update({
            where: { id: notification.id },
            data: { scheduledFor: recent },
          }),
        ),
      ),
    ]);
    expect(await purgeOldNotifications(NOW)).toBeGreaterThanOrEqual(3);
    const left = await prisma.notification.findMany({
      where: { id: { in: [...purged, ...kept].map((notification) => notification.id) } },
      select: { id: true },
    });
    expect(left.map((notification) => notification.id).sort()).toEqual(
      kept.map((notification) => notification.id).sort(),
    );
  });
});

describe("purgeExpiredSessions", () => {
  it("deletes sessions past their expiry and keeps the others", async () => {
    const user = await createUser();
    const expired = await createSession(user.id);
    await prisma.session.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(NOW.getTime() - 1) },
    });
    const valid = await createSession(user.id);

    expect(await purgeExpiredSessions(NOW)).toBeGreaterThanOrEqual(1);

    expect(
      (await prisma.session.findMany({ where: { userId: user.id }, select: { id: true } })).map(
        (session) => session.id,
      ),
    ).toEqual([valid.id]);
  });
});

describe("purgeStaleOAuthTokens", () => {
  it("removes tokens the login hook left behind, but not those of a login in progress", async () => {
    // updatedAt comes from the database client's clock, so the test runs the purge from a time
    // after it: the left-behind tokens are then older than the limit, the fresh ones are not.
    const purgeAt = new Date(Date.now() + OAUTH_TOKEN_MAX_AGE_MS + 60_000);
    const left = await createUser();
    await prisma.account.updateMany({
      where: { userId: left.id },
      data: { idToken: "id", accessTokenExpiresAt: NOW, refreshTokenExpiresAt: NOW },
    });
    const fresh = await createUser();
    await prisma.account.updateMany({ where: { userId: fresh.id }, data: { updatedAt: purgeAt } });

    expect(await purgeStaleOAuthTokens(purgeAt)).toBeGreaterThanOrEqual(1);

    expect(await prisma.account.findFirstOrThrow({ where: { userId: left.id } })).toMatchObject({
      accountId: left.discordId,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    });
    expect(await prisma.account.findFirstOrThrow({ where: { userId: fresh.id } })).toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
    });
  });
});

describe("recordHeartbeat", () => {
  it("keeps one row per loop with the latest time", async () => {
    await recordHeartbeat("sweeper", NOW);
    const later = new Date(NOW.getTime() + 60_000);
    await recordHeartbeat("sweeper", later);
    await recordHeartbeat("outbox", NOW);
    await recordHeartbeat("opl", NOW);
    expect(
      await prisma.systemStatus.findMany({
        where: { id: { in: Object.values(BOT_LOOP_STATUS_IDS) } },
        orderBy: { id: "asc" },
      }),
    ).toEqual([
      { id: BOT_LOOP_STATUS_IDS.sweeper, heartbeatAt: later },
      { id: BOT_LOOP_STATUS_IDS.opl, heartbeatAt: NOW },
      { id: BOT_LOOP_STATUS_IDS.outbox, heartbeatAt: NOW },
    ]);
  });
});

describe("getBotStatus", () => {
  const admin = useAdmin();

  it("is only for admins", async () => {
    const user = await createUser();
    await expect(getBotStatus(user.id, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts the bot as offline without heartbeats or when one loop is silent for 3 minutes", async () => {
    await prisma.systemStatus.deleteMany({
      where: { id: { in: Object.values(BOT_LOOP_STATUS_IDS) } },
    });
    expect(await getBotStatus(admin.id, NOW)).toEqual({
      online: false,
      loops: {
        sweeper: { heartbeatAt: null, online: false },
        outbox: { heartbeatAt: null, online: false },
        opl: { heartbeatAt: null, online: false },
      },
    });

    const outboxAt = new Date(NOW.getTime() - 60_000);
    await recordHeartbeat("sweeper", NOW);
    await recordHeartbeat("outbox", outboxAt);
    await recordHeartbeat("opl", NOW);
    const limit = new Date(outboxAt.getTime() + BOT_OFFLINE_AFTER_MS);
    expect(await getBotStatus(admin.id, limit)).toEqual({
      online: true,
      loops: {
        sweeper: { heartbeatAt: NOW, online: true },
        outbox: { heartbeatAt: outboxAt, online: true },
        opl: { heartbeatAt: NOW, online: true },
      },
    });
    // Only the sender is silent: the bot counts as offline, and the loop is named.
    expect(await getBotStatus(admin.id, new Date(limit.getTime() + 1))).toEqual({
      online: false,
      loops: {
        sweeper: { heartbeatAt: NOW, online: true },
        outbox: { heartbeatAt: outboxAt, online: false },
        opl: { heartbeatAt: NOW, online: true },
      },
    });
  });
});

describe("runSweeper (§6.3)", () => {
  afterEach(() => {
    faults.expireRequests = false;
    vi.restoreAllMocks();
  });

  it("expires requests and opens and evaluates scrims in one run", async () => {
    const host = await createFullyVerifiedTeam();
    const applicant = await createFullyVerifiedTeam();
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
      requestId: request.id,
      now: NOW,
    });
    const { scrim } = await bookScrim();
    const deadline = scrim.feedbackDeadline;

    const result = await runSweeper(deadline, { purge: false });
    expect(result.expiredRequests).toBeGreaterThanOrEqual(1);
    expect(result.openedFeedback).toBeGreaterThanOrEqual(1);
    expect(result.resolvedScrims).toBeGreaterThanOrEqual(1);
    expect(result.purgedNotifications).toBeNull();
    // Sessions, tokens and interrupted deletions are handled in every run.
    expect(result.purgedSessions).not.toBeNull();
    expect(result.clearedTokens).not.toBeNull();
    expect(result.finishedDeletions).not.toBeNull();
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.EXPIRED });
    expect(await prisma.scrim.findUniqueOrThrow({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.UNCONFIRMED,
    });
    expect(
      await prisma.notification.count({
        where: { requestId: request.id, type: NotifType.REQUEST_EXPIRED },
      }),
    ).toBe(1);
  });

  it("purges old notifications only when asked to", async () => {
    expect((await runSweeper(NOW, { purge: true })).purgedNotifications).not.toBeNull();
    expect((await runSweeper(NOW, { purge: false })).purgedNotifications).toBeNull();
  });

  it("runs the other steps when one step fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scrim } = await bookScrim();
    const now = new Date(scrim.feedbackDeadline.getTime() + 60 * 1000);
    faults.expireRequests = true;

    const result = await runSweeper(now, { purge: false });
    expect(result.expiredRequests).toBeNull();
    expect(result.openedFeedback).toBeGreaterThanOrEqual(1);
    expect(result.resolvedScrims).toBeGreaterThanOrEqual(1);
    expect(errors).toHaveBeenCalledWith("Sweeper step expireRequests failed", expect.any(Error));
    expect(await prisma.scrim.findUniqueOrThrow({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.UNCONFIRMED,
    });
  });
});
