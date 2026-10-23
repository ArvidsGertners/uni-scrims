"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { safeCallbackURL } from "@/lib/callback-url";
import { RATE_LIMITED, allowAttempt } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

/**
 * The code after the password (§5.9): from the authenticator app, or one of the backup codes. Only
 * for the pending login; with a session Better Auth would check the code against it instead, and
 * the 2FA setup has its own page.
 */
export async function verifyLoginCodeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const callbackURL = safeCallbackURL(formField(formData, "callbackURL")?.toString());
  if (await getSessionUserId()) redirect(callbackURL);
  if (!(await allowAttempt("code"))) return { error: RATE_LIMITED };
  const code = String(formField(formData, "code") ?? "").replaceAll(/\s/g, "");
  const backup = formField(formData, "backup") === "on";
  const state = await runAction(async () => {
    const options = { body: { code }, headers: await headers() };
    if (backup) await auth.api.verifyBackupCode(options);
    else await auth.api.verifyTOTP(options);
  });
  if (state.error) return state;
  redirect(callbackURL);
}
