// Sweeper (ARCHITECTURE §6.3): time-driven state changes, run by the bot every minute. Every step is
// idempotent and derives from the database alone, so after a bot outage the next run catches up.
import { NotifStatus, prisma } from "@uni-scrims/db";
import { requireAdmin } from "./permissions.ts";
import { expireRequests } from "./requests.ts";
import { openFeedback, resolveDeadlines } from "./scrims.ts";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Entries that are no longer pending are kept this long (SPEC §9: notifications 30 days). */
export const NOTIFICATION_RETENTION_MS = 30 * DAY;

/** SystemStatus row of the bot; the admin page shows it as offline after 3 minutes (§6.3). */
export const BOT_STATUS_ID = "bot";
export const BOT_OFFLINE_AFTER_MS = 3 * MINUTE;

/** Admin: last heartbeat of the bot and whether it is recent enough to count as running. */
export async function getBotStatus(adminId: string, now: Date) {
  await requireAdmin(adminId);
  const status = await prisma.systemStatus.findUnique({ where: { id: BOT_STATUS_ID } });
  const heartbeatAt = status?.heartbeatAt ?? null;
  return {
    heartbeatAt,
    online: heartbeatAt !== null && now.getTime() - heartbeatAt.getTime() <= BOT_OFFLINE_AFTER_MS,
  };
}

/** Deletes sent, failed and cancelled entries older than NOTIFICATION_RETENTION_MS. */
export async function purgeOldNotifications(now: Date): Promise<number> {
  const deleted = await prisma.notification.deleteMany({
    where: {
      status: { not: NotifStatus.PENDING },
      createdAt: { lt: new Date(now.getTime() - NOTIFICATION_RETENTION_MS) },
    },
  });
  return deleted.count;
}

export async function recordBotHeartbeat(now: Date): Promise<void> {
  await prisma.systemStatus.upsert({
    where: { id: BOT_STATUS_ID },
    create: { id: BOT_STATUS_ID, heartbeatAt: now },
    update: { heartbeatAt: now },
  });
}

/**
 * One sweeper run in the order of §6.3. A failing step is logged and does not stop the others;
 * the next run tries again. The heartbeat is always written. Purging hourly is enough.
 * Counts are null for steps that failed or were skipped.
 */
export async function runSweeper(now: Date, options: { purge: boolean }) {
  const step = async (name: string, run: () => Promise<number>): Promise<number | null> => {
    try {
      return await run();
    } catch (error) {
      console.error(`Sweeper step ${name} failed`, error);
      return null;
    }
  };
  const result = {
    expiredRequests: await step("expireRequests", () => expireRequests(now)),
    openedFeedback: await step("openFeedback", () => openFeedback(now)),
    resolvedScrims: await step("resolveDeadlines", () => resolveDeadlines(now)),
    purgedNotifications: options.purge
      ? await step("purgeOldNotifications", () => purgeOldNotifications(now))
      : null,
  };
  await recordBotHeartbeat(now);
  return result;
}
