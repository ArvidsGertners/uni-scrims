// Sweeper (ARCHITECTURE §6.3): time-driven state changes and purges, run by the bot every minute,
// also while it cannot log in to Discord. Every step is idempotent and derives from the database
// alone, so after a bot outage the next run catches up. Also the heartbeats of both bot loops.
import { NotifStatus, prisma } from "@uni-scrims/db";
import { purgeOldConversations } from "./messages.ts";
import { requireAdmin } from "./permissions.ts";
import { postSeriesRequests } from "./request-series.ts";
import { expireRequests } from "./requests.ts";
import { openFeedback, resolveDeadlines } from "./scrims.ts";
import { NO_OAUTH_TOKENS, finishInterruptedDeletions } from "./users.ts";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Entries that are no longer pending are kept this long (SPEC §9: notifications 30 days). */
export const NOTIFICATION_RETENTION_MS = 30 * DAY;

/**
 * Discord tokens older than this are removed by the sweeper (§6.3). The login hook removes them
 * seconds after the login; this only catches a hook that failed or did not run.
 */
export const OAUTH_TOKEN_MAX_AGE_MS = 10 * MINUTE;

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
 * Deletes sent, failed and cancelled entries once their creation, their last planned send
 * (scheduledFor: the last attempt of a failed entry, the cancellation of a cancelled one) and their
 * actual send (sentAt) are all older than NOTIFICATION_RETENTION_MS. A reminder booked weeks ahead
 * that fails at its time therefore stays in the admin list for 30 days too.
 */
export async function purgeOldNotifications(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_MS);
  const deleted = await prisma.notification.deleteMany({
    where: {
      status: { not: NotifStatus.PENDING },
      createdAt: { lt: cutoff },
      scheduledFor: { lt: cutoff },
      OR: [{ sentAt: null }, { sentAt: { lt: cutoff } }],
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

/** Discord tokens the login hook could not remove (§5.1): at most OAUTH_TOKEN_MAX_AGE_MS old. */
export async function purgeStaleOAuthTokens(now: Date): Promise<number> {
  const cleared = await prisma.account.updateMany({
    where: {
      updatedAt: { lt: new Date(now.getTime() - OAUTH_TOKEN_MAX_AGE_MS) },
      OR: [
        { accessToken: { not: null } },
        { refreshToken: { not: null } },
        { idToken: { not: null } },
      ],
    },
    data: NO_OAUTH_TOKENS,
  });
  return cleared.count;
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
 * the next run tries again. Old notifications and threads are purged only with `purge` (hourly is
 * enough), the rest in every run. Counts are null for steps that failed or were skipped. The bot loop writes the
 * heartbeat afterwards, with the time the run ended.
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
  return {
    expiredRequests: await step("expireRequests", () => expireRequests(now)),
    postedSeriesRequests: await step("postSeriesRequests", () => postSeriesRequests(now)),
    openedFeedback: await step("openFeedback", () => openFeedback(now)),
    resolvedScrims: await step("resolveDeadlines", () => resolveDeadlines(now)),
    finishedDeletions: await step("finishInterruptedDeletions", () => finishInterruptedDeletions()),
    purgedSessions: await step("purgeExpiredSessions", () => purgeExpiredSessions(now)),
    clearedTokens: await step("purgeStaleOAuthTokens", () => purgeStaleOAuthTokens(now)),
    purgedNotifications: options.purge
      ? await step("purgeOldNotifications", () => purgeOldNotifications(now))
      : null,
    // Phase 32 (§5.30): threads 30 days after their start, with the notifications' hourly purge.
    purgedConversations: options.purge
      ? await step("purgeOldConversations", () => purgeOldConversations(now))
      : null,
  };
}
