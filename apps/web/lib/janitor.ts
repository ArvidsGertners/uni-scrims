// Upload janitor in the web process (ARCHITECTURE §5.2): at startup and then hourly.
// Sequential loop with await + sleep, never setInterval, so runs cannot overlap.
import { setTimeout as sleep } from "node:timers/promises";
import { resolveUploadDir, runUploadJanitor } from "@uni-scrims/core";

const INTERVAL_MS = 60 * 60 * 1000;

// On globalThis: the dev server calls register() more than once and may re-import this module.
const state = globalThis as unknown as { uploadJanitorStarted?: boolean };

export function startUploadJanitor(): void {
  if (state.uploadJanitorStarted) return;
  state.uploadJanitorStarted = true;
  void loop();
}

async function loop(): Promise<never> {
  for (;;) {
    try {
      const result = await runUploadJanitor(resolveUploadDir(), new Date());
      if (result.autoRejected + result.decidedFiles + result.orphanFiles > 0) {
        console.log("Upload janitor", result);
      }
    } catch (error) {
      console.error("Upload janitor failed", error);
    }
    await sleep(INTERVAL_MS);
  }
}
