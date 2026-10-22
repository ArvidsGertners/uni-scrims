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
  BOT_OFFLINE_AFTER_MS,
  BOT_STATUS_ID,
  NOTIFICATION_RETENTION_MS,
  applyToRequest,
  getBotStatus,
  purgeOldNotifications,
  recordBotHeartbeat,
  runSweeper,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import type * as Requests from "../src/requests.ts";
import {
  NOW,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
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

describe("recordBotHeartbeat", () => {
  it("keeps one row with the latest time", async () => {
    await recordBotHeartbeat(NOW);
    const later = new Date(NOW.getTime() + 60_000);
    await recordBotHeartbeat(later);
    expect(await prisma.systemStatus.findMany({ where: { id: BOT_STATUS_ID } })).toEqual([
      { id: BOT_STATUS_ID, heartbeatAt: later },
    ]);
  });
});

describe("getBotStatus", () => {
  const admin = useAdmin();

  it("is only for admins", async () => {
    const user = await createUser();
    await expect(getBotStatus(user.id, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("counts the bot as offline without a heartbeat or after 3 minutes", async () => {
    await prisma.systemStatus.deleteMany({ where: { id: BOT_STATUS_ID } });
    expect(await getBotStatus(admin.id, NOW)).toEqual({ heartbeatAt: null, online: false });
    await recordBotHeartbeat(NOW);
    const limit = new Date(NOW.getTime() + BOT_OFFLINE_AFTER_MS);
    expect(await getBotStatus(admin.id, limit)).toEqual({ heartbeatAt: NOW, online: true });
    expect(await getBotStatus(admin.id, new Date(limit.getTime() + 1))).toEqual({
      heartbeatAt: NOW,
      online: false,
    });
  });
});

describe("runSweeper (§6.3)", () => {
  afterEach(() => {
    faults.expireRequests = false;
    vi.restoreAllMocks();
  });

  it("expires requests, opens and evaluates scrims and writes the heartbeat in one run", async () => {
    const host = await createReadyTeam();
    const applicant = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({ userId: applicant.captain.id, requestId: request.id, now: NOW });
    const { scrim } = await bookScrim();
    const deadline = scrim.feedbackDeadline;

    const result = await runSweeper(deadline, { purge: false });
    expect(result.expiredRequests).toBeGreaterThanOrEqual(1);
    expect(result.openedFeedback).toBeGreaterThanOrEqual(1);
    expect(result.resolvedScrims).toBeGreaterThanOrEqual(1);
    expect(result.purgedNotifications).toBeNull();
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
    expect(await prisma.systemStatus.findUnique({ where: { id: BOT_STATUS_ID } })).toEqual({
      id: BOT_STATUS_ID,
      heartbeatAt: deadline,
    });
  });

  it("purges only when asked to", async () => {
    expect((await runSweeper(NOW, { purge: true })).purgedNotifications).not.toBeNull();
  });

  it("runs the other steps and writes the heartbeat when one step fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { scrim } = await bookScrim();
    // Later than in the other tests, so the heartbeat is surely from this run.
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
    expect(await prisma.systemStatus.findUnique({ where: { id: BOT_STATUS_ID } })).toEqual({
      id: BOT_STATUS_ID,
      heartbeatAt: now,
    });
  });
});
