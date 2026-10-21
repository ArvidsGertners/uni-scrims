import {
  NotifChannel,
  NotifStatus,
  NotifType,
  RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  BOT_STATUS_ID,
  NOTIFICATION_RETENTION_MS,
  applyToRequest,
  purgeOldNotifications,
  recordBotHeartbeat,
  runSweeper,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import { NOW, bookScrim, createOpenRequest, createReadyTeam, createUser, uid } from "./helpers.ts";

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

describe("runSweeper (§6.3)", () => {
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
});
