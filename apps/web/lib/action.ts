import { isDomainError } from "@uni-scrims/core";
import { z } from "zod";
import type { ActionState } from "./action-state.ts";
import { MAIL_FAILED } from "./mail.ts";

export type { ActionState } from "./action-state.ts";

/** German texts for the Better Auth errors the account actions can hit (§5.8). */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-Mail-Adresse oder Passwort stimmen nicht.",
  EMAIL_NOT_VERIFIED:
    "Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir den Link noch einmal geschickt.",
  INVALID_TOKEN: "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.",
  TOKEN_EXPIRED: "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.",
  INVALID_PASSWORD: "Das aktuelle Passwort stimmt nicht.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Für dein Konto ist noch kein Passwort gesetzt.",
  PASSWORD_TOO_SHORT: "Das Passwort ist zu kurz.",
  PASSWORD_TOO_LONG: "Das Passwort ist zu lang.",
  MAIL_FAILED,
};

/** An APIError of Better Auth, matched by shape: the class lives in more than one package. */
function authErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("body" in error)) return null;
  const body = (error as { body?: { code?: unknown } }).body;
  return typeof body?.code === "string" ? body.code : null;
}

/** Runs a server action body and turns domain and Better Auth errors into a message for the form. */
export async function runAction(body: () => Promise<void>): Promise<ActionState> {
  try {
    await body();
    return { error: null, done: true };
  } catch (error) {
    if (isDomainError(error)) return { error: error.message };
    const code = authErrorCode(error);
    if (code && AUTH_ERROR_MESSAGES[code]) return { error: AUTH_ERROR_MESSAGES[code] };
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
