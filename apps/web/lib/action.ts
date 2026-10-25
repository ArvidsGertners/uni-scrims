import { isDomainError, renderMessage } from "@uni-scrims/core";
import { z } from "zod";
import { actionMessages } from "../i18n/common.ts";
import type { ActionState } from "./action-state.ts";
import { getLocale } from "./locale.ts";

export type { ActionState } from "./action-state.ts";

/** An APIError of Better Auth, matched by shape: the class lives in more than one package. */
function authErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("body" in error)) return null;
  const body = (error as { body?: { code?: unknown } }).body;
  return typeof body?.code === "string" ? body.code : null;
}

/**
 * Runs a server action body and turns domain and Better Auth errors into a message for the form, in
 * the language of the request (§5.21).
 */
export async function runAction(body: () => Promise<void>): Promise<ActionState> {
  try {
    await body();
    return { error: null, done: true };
  } catch (error) {
    const locale = await getLocale();
    if (isDomainError(error)) return { error: renderMessage(error.text, locale) };
    const t = actionMessages[locale];
    const code = authErrorCode(error);
    if (code && t.authErrors[code]) return { error: t.authErrors[code] };
    console.error("Server action failed", error);
    return { error: t.somethingWentWrong };
  }
}

// Shape checks shared by the server actions; the content rules live in core.

export const idSchema = z.string().min(1);

/** A form that does not fit the action's shape, in the language of the request. */
export async function invalidInput(): Promise<ActionState> {
  return { error: actionMessages[await getLocale()].invalidInput };
}

export function formField(formData: FormData, name: string): FormDataEntryValue | undefined {
  return formData.get(name) ?? undefined;
}
