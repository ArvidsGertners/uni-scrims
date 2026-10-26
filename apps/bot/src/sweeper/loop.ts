// Sweeper loop (ARCHITECTURE §6.3): every minute, from the start of the bot process on, also while
// it cannot log in to Discord. Sequential loop with await + sleep, never setInterval. Old
// notifications are purged right after a start and then at most once an hour; a purge that failed
// is tried again in the next run. The heartbeat follows every run, with the time the run ended.
import { setTimeout as sleep } from "node:timers/promises";
import { recordHeartbeat, runSweeper } from "@uni-scrims/core";

const INTERVAL_MS = 60 * 1000;
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export type SweeperDeps = {
  runSweeper: typeof runSweeper;
  recordHeartbeat: typeof recordHeartbeat;
  clock: () => Date;
};

const defaultDeps: SweeperDeps = { runSweeper, recordHeartbeat, clock: () => new Date() };

/** When the notification purge is due: at the first run, then an hour after the last one that ran. */
export function createPurgeSchedule(intervalMs: number = PURGE_INTERVAL_MS) {
  let lastPurge: number | null = null;
  return {
    isDue: (now: Date) => lastPurge === null || now.getTime() - lastPurge >= intervalMs,
    ran: (now: Date) => {
      lastPurge = now.getTime();
    },
  };
}

/** One run of the loop: the steps, then the heartbeat. */
export async function sweeperTick(
  schedule: ReturnType<typeof createPurgeSchedule>,
  deps: SweeperDeps = defaultDeps,
): Promise<void> {
  const now = deps.clock();
  const purge = schedule.isDue(now);
  try {
    const result = await deps.runSweeper(now, { purge });
    // A failed purge step (notifications or threads, §6.3) is tried again in the next run.
    if (purge && result.purgedNotifications !== null && result.purgedConversations !== null) {
      schedule.ran(now);
    }
    if (Object.values(result).some((count) => count !== null && count > 0)) {
      console.log("Sweeper", result);
    }
  } catch (error) {
    // The steps log their own errors; this is only for the unexpected.
    console.error("Sweeper run failed", error);
  }
  try {
    await deps.recordHeartbeat("sweeper", deps.clock());
  } catch (error) {
    console.error("Could not write the sweeper heartbeat", error);
  }
}

export async function runSweeperLoop(): Promise<never> {
  const schedule = createPurgeSchedule();
  for (;;) {
    await sweeperTick(schedule);
    await sleep(INTERVAL_MS);
  }
}
