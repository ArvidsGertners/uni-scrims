// Outbox sender loop (ARCHITECTURE §6.2): every 5 s. Sequential loop with await + sleep, never
// setInterval, so slow runs (rate limits) cannot overlap and send entries twice. Writes its own
// heartbeat at most once a minute, so the admin page also notices a sender that hangs (§6.3).
import { setTimeout as sleep } from "node:timers/promises";
import { type Deliver, deliverDueNotifications, recordHeartbeat } from "@uni-scrims/core";

const INTERVAL_MS = 5 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

export async function runOutboxLoop(deliver: Deliver): Promise<never> {
  let lastHeartbeat: number | null = null;
  for (;;) {
    try {
      const counts = await deliverDueNotifications(new Date(), deliver);
      if (Object.values(counts).some((count) => count > 0)) console.log("Outbox", counts);
    } catch (error) {
      console.error("Outbox run failed", error);
    }
    const ended = new Date();
    if (lastHeartbeat === null || ended.getTime() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      try {
        await recordHeartbeat("outbox", ended);
        lastHeartbeat = ended.getTime();
      } catch (error) {
        console.error("Could not write the outbox heartbeat", error);
      }
    }
    await sleep(INTERVAL_MS);
  }
}
