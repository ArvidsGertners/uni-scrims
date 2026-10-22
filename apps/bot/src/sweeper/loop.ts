// Sweeper loop (ARCHITECTURE §6.3): every minute. Sequential loop with await + sleep, never
// setInterval. Old notifications and expired sessions are purged at most once an hour, and right
// after a start. The heartbeat follows every run, with the time the run ended.
import { setTimeout as sleep } from "node:timers/promises";
import { recordHeartbeat, runSweeper } from "@uni-scrims/core";

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
      // The steps log their own errors; this is only for the unexpected.
      console.error("Sweeper run failed", error);
    }
    try {
      await recordHeartbeat("sweeper", new Date());
    } catch (error) {
      console.error("Could not write the sweeper heartbeat", error);
    }
    await sleep(INTERVAL_MS);
  }
}
