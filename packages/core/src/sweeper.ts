// Sweeper (ARCHITECTURE §6.3): time-driven state changes, run by the bot every minute. Every step is
// idempotent and derives from the database alone, so after a bot outage the next run catches up.
// Also the heartbeats of both bot loops for the admin page.
import { NotifStatus, prisma } from "@uni-scrims/db";
import { requireAdmin } from "./permissions.ts";
import { expireRequests } from "./requests.ts";
import { openFeedback, resolveDeadlines } from "./scrims.ts";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Entries that are no longer pending are kept this long (SPEC §9: notifications 30 days). */
export const NOTIFICATION_RETENTION_MS = 30 * DAY;

/**
 * SystemStatus rows of the two bot loops (§6.3): each writes its heartbeat after a run. "bot" is the
 * sweeper's row from before the outbox had one. The admin page shows the bot as offline when either
 * heartbeat is older than 3 minutes.
 */
export const BOT_LOOP_STATUS_IDS = { sweeper: "bot", outbox: "outbox" } as const;
export type BotLoop = keyof typeof BOT_LOOP_STATUS_IDS;
export const BOT_STATUS_ID = BOT_LOOP_STATUS_IDS.sweeper;
export const BOT_OFFLINE_AFTER_MS = 3 * MINUTE;

/** Admin: last heartbeat of each bot loop and whether all of them are recent enough. */
export async function getBotStatus(adminId: string, now: Date) {
  await requireAdmin(adminId);
  const rows = await prisma.systemStatus.findMany({
    where: { id: { in: Object.values(BOT_LOOP_STATUS_IDS) } },
  });
  const loopStatus = (loop: BotLoop) => {
    const heartbeatAt =
      rows.find((row) => row.id === BOT_LOOP_STATUS_IDS[loop])?.heartbeatAt ?? null;
    return {
      heartbeatAt,
      online: heartbeatAt !== null && now.getTime() - heartbeatAt.getTime() <= BOT_OFFLINE_AFTER_MS,
    };
  };
  const loops = { sweeper: loopStatus("sweeper"), outbox: loopStatus("outbox") };
  return { online: loops.sweeper.online && loops.outbox.online, loops };
}

/**
 * Deletes sent, failed and cancelled entries once both their creation and their last planned send
 * (scheduledFor, moved by every retry) are older than NOTIFICATION_RETENTION_MS. A reminder booked
 * weeks ahead that fails at its time therefore stays in the admin list for 30 days too.
 */
export async function purgeOldNotifications(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_MS);
  const deleted = await prisma.notification.deleteMany({
    where: {
      status: { not: NotifStatus.PENDING },
      createdAt: { lt: cutoff },
      scheduledFor: { lt: cutoff },
    },
  });
  return deleted.count;
}

/**
 * Sessions past expiresAt, with IP address and user agent (§5.1). Better Auth only deletes one when
 * its cookie comes back, so sessions of devices that never return would stay forever.
 */
export async function purgeExpiredSessions(now: Date): Promise<number> {
  const deleted = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return deleted.count;
}

/** Written by each bot loop after a run, with the time after the run (not its start). */
export async function recordHeartbeat(loop: BotLoop, now: Date): Promise<void> {
  const id = BOT_LOOP_STATUS_IDS[loop];
  await prisma.systemStatus.upsert({
    where: { id },
    create: { id, heartbeatAt: now },
    update: { heartbeatAt: now },
  });
}

/**
 * One sweeper run in the order of §6.3. A failing step is logged and does not stop the others;
 * the next run tries again. Purging hourly is enough. Counts are null for steps that failed or were
 * skipped. The bot loop writes the heartbeat afterwards, with the time the run ended.
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
    purgedSessions: options.purge
      ? await step("purgeExpiredSessions", () => purgeExpiredSessions(now))
      : null,
  };
  return result;
}
