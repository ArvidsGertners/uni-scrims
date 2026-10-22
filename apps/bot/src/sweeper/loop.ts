// Sweeper loop (ARCHITECTURE §6.3): every minute. Sequential loop with await + sleep, never
// setInterval. Old notifications are purged at most once an hour, and right after a start.
import { setTimeout as sleep } from "node:timers/promises";
import { runSweeper } from "@uni-scrims/core";

const INTERVAL_MS = 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

export async function runSweeperLoop(): Promise<never> {
  let lastPurge: number | null = null;
  for (;;) {
    const now = new Date();
    const purge = lastPurge === null || now.getTime() - lastPurge >= PURGE_INTERVAL_MS;
    try {
      const result = await runSweeper(now, { purge });
      if (purge) lastPurge = now.getTime();
      if (Object.values(result).some((count) => count !== null && count > 0)) {
        console.log("Sweeper", result);
      }
    } catch (error) {
      // Only the heartbeat throws; the steps log their own errors.
      console.error("Sweeper run failed", error);
    }
    await sleep(INTERVAL_MS);
  }
}
