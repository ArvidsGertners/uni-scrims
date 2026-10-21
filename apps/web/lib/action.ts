import { isDomainError } from "@uni-scrims/core";
import type { ActionState } from "./action-state.ts";

export type { ActionState } from "./action-state.ts";

/** Runs a server action body and turns domain errors into a message for the form. */
export async function runAction(body: () => Promise<void>): Promise<ActionState> {
  try {
    await body();
    return { error: null, done: true };
  } catch (error) {
    if (isDomainError(error)) return { error: error.message };
    console.error("Server action failed", error);
    return { error: "Etwas ist schiefgelaufen. Bitte versuch es erneut." };
  }
}
