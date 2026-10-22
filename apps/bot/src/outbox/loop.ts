// Outbox sender loop (ARCHITECTURE §6.2): every 5 s. Sequential loop with await + sleep, never
// setInterval, so slow runs (rate limits) cannot overlap and send entries twice. Writes its own
// heartbeat at most once a minute, after each run and after each message inside a run, so the admin
// page notices a sender that hangs but not one that is merely slowed down by rate limits (§6.3).
import { setTimeout as sleep } from "node:timers/promises";
import { type Deliver, deliverDueNotifications, recordHeartbeat } from "@uni-scrims/core";

const INTERVAL_MS = 5 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export async function runOutboxLoop(deliver: Deliver): Promise<never> {
  let lastHeartbeat: number | null = null;
  const heartbeat = async () => {
    const now = new Date();
    if (lastHeartbeat !== null && now.getTime() - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
    try {
      await recordHeartbeat("outbox", now);
      lastHeartbeat = now.getTime();
    } catch (error) {
      console.error("Could not write the outbox heartbeat", error);
    }
  };
  const deliverWithHeartbeat: Deliver = async (message) => {
    const result = await deliver(message);
    await heartbeat();
    return result;
  };
  for (;;) {
    try {
      const counts = await deliverDueNotifications(new Date(), deliverWithHeartbeat);
      if (Object.values(counts).some((count) => count > 0)) console.log("Outbox", counts);
    } catch (error) {
      console.error("Outbox run failed", error);
    }
    await heartbeat();
    await sleep(INTERVAL_MS);
  }
}
