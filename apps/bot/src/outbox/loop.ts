// Outbox sender loop (ARCHITECTURE §6.2): every 5 s. Sequential loop with await + sleep, never
// setInterval, so slow runs (rate limits) cannot overlap and send entries twice.
import { setTimeout as sleep } from "node:timers/promises";
import { type Deliver, deliverDueNotifications } from "@uni-scrims/core";

const INTERVAL_MS = 5 * 1000;

export async function runOutboxLoop(deliver: Deliver): Promise<never> {
  for (;;) {
    try {
      const counts = await deliverDueNotifications(new Date(), deliver);
      if (Object.values(counts).some((count) => count > 0)) console.log("Outbox", counts);
    } catch (error) {
      console.error("Outbox run failed", error);
    }
    await sleep(INTERVAL_MS);
  }
}
