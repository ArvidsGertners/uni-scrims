import { isDomainError } from "@uni-scrims/core";
import { z } from "zod";
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

// Shape checks shared by the server actions; the content rules live in core.

export const idSchema = z.string().min(1);

export const invalidInput: ActionState = { error: "Ungültige Eingabe." };

export function formField(formData: FormData, name: string): FormDataEntryValue | undefined {
  return formData.get(name) ?? undefined;
}
