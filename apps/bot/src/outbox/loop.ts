// Outbox sender loop (ARCHITECTURE §6.2): every 5 s. Sequential loop with await + sleep, never
// setInterval, so slow runs (rate limits) cannot overlap and send entries twice. Writes its own
// heartbeat at most once a minute, after each run and after each message inside a run, so the admin
// page notices a sender that hangs but not one that is merely slowed down by rate limits (§6.3).
import { setTimeout as sleep } from "node:timers/promises";
import { type Deliver, deliverDueNotifications, recordHeartbeat } from "@uni-scrims/core";

const INTERVAL_MS = 5 * 1000;
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export type OutboxDeps = {
  deliverDueNotifications: typeof deliverDueNotifications;
  recordHeartbeat: typeof recordHeartbeat;
  clock: () => Date;
};

const defaultDeps: OutboxDeps = {
  deliverDueNotifications,
  recordHeartbeat,
  clock: () => new Date(),
};

/** Writes the outbox heartbeat, at most once per interval; a failed write is retried next time. */
export function createHeartbeat(
  deps: OutboxDeps = defaultDeps,
  intervalMs = HEARTBEAT_INTERVAL_MS,
) {
  let lastHeartbeat: number | null = null;
  return async () => {
    const now = deps.clock();
    if (lastHeartbeat !== null && now.getTime() - lastHeartbeat < intervalMs) return;
    try {
      await deps.recordHeartbeat("outbox", now);
      lastHeartbeat = now.getTime();
    } catch (error) {
      console.error("Could not write the outbox heartbeat", error);
    }
  };
}

/** One run of the loop: due entries, with the heartbeat after each message and after the run. */
export async function outboxTick(
  deliver: Deliver,
  heartbeat: () => Promise<void>,
  deps: OutboxDeps = defaultDeps,
): Promise<void> {
  const deliverWithHeartbeat: Deliver = async (message) => {
    const result = await deliver(message);
    await heartbeat();
    return result;
  };
  try {
    const counts = await deps.deliverDueNotifications(deps.clock(), deliverWithHeartbeat);
    if (Object.values(counts).some((count) => count > 0)) console.log("Outbox", counts);
  } catch (error) {
    console.error("Outbox run failed", error);
  }
  await heartbeat();
}

export async function runOutboxLoop(deliver: Deliver): Promise<never> {
  const heartbeat = createHeartbeat();
  for (;;) {
    await outboxTick(deliver, heartbeat);
    await sleep(INTERVAL_MS);
  }
}
