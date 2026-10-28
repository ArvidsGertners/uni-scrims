// OPL check loop (ARCHITECTURE §6.5): checks one OPL link per run (oplTick, §5.37), from the start of
// the bot process on, without Discord. Sequential loop with await + sleep, never setInterval. At most
// 40 calls a minute; below 30 remaining calls it waits for OPL's reset, as the web uses the same key.
// Errors log only the status: OPL's answers may echo the key or hold personal data.
import { setTimeout as sleep } from "node:timers/promises";
import {
  type OplApi,
  OplError,
  oplClientFromEnv,
  oplTick,
  recordHeartbeat,
} from "@uni-scrims/core";

/** Pause after each call: at most 40 calls a minute. */
export const CALL_PAUSE_MS = 1500;
/** Pause when nothing is due, without a key or after an unexpected error. */
export const IDLE_MS = 60 * 1000;
/** Pause after OPL rejected the key. */
export const AUTH_PAUSE_MS = 60 * 60 * 1000;
/** Below this many remaining calls the loop waits for OPL's reset. */
export const MIN_REMAINING = 30;
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export type OplLoopDeps = {
  opl: OplApi | null;
  oplTick: typeof oplTick;
  recordHeartbeat: typeof recordHeartbeat;
  clock: () => Date;
};

/** Writes the heartbeat at most once per interval; a failed write is retried next time. */
export function createOplHeartbeat(deps: OplLoopDeps, intervalMs = HEARTBEAT_INTERVAL_MS) {
  let lastHeartbeat: number | null = null;
  return async () => {
    const now = deps.clock();
    if (lastHeartbeat !== null && now.getTime() - lastHeartbeat < intervalMs) return;
    try {
      await deps.recordHeartbeat("opl", now);
      lastHeartbeat = now.getTime();
    } catch (error) {
      console.error("Could not write the OPL heartbeat", error);
    }
  };
}

/** One run: at most one check, then the heartbeat. Returns how long to sleep. */
export async function oplLoopTick(
  heartbeat: () => Promise<void>,
  deps: OplLoopDeps,
): Promise<number> {
  let delay = IDLE_MS;
  if (deps.opl) {
    try {
      const { checked, rateLimit } = await deps.oplTick({ now: deps.clock(), opl: deps.opl });
      // A used-up limit (429) comes back as checked with remaining 0, so it waits for the reset too.
      if (checked) {
        delay = CALL_PAUSE_MS;
        if (rateLimit?.remaining != null && rateLimit.remaining < MIN_REMAINING) {
          delay = Math.max(delay, (rateLimit.resetSec ?? 60) * 1000);
        }
      }
    } catch (error) {
      if (error instanceof OplError && error.reason === "auth") {
        console.error(`OPL rejected the API key (${error.status}), pausing for an hour`);
        delay = AUTH_PAUSE_MS;
      } else {
        console.error("OPL check failed", error instanceof OplError ? error.message : error);
      }
    }
  }
  await heartbeat();
  return delay;
}

export async function runOplLoop(): Promise<never> {
  const deps: OplLoopDeps = {
    opl: oplClientFromEnv(),
    oplTick,
    recordHeartbeat,
    clock: () => new Date(),
  };
  if (!deps.opl) console.log("OPLEAGUE_API_KEY is not set, OPL links are not checked");
  const heartbeat = createOplHeartbeat(deps);
  for (;;) {
    await sleep(await oplLoopTick(heartbeat, deps));
  }
}
