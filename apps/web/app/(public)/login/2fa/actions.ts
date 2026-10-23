"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { safeCallbackURL } from "@/lib/callback-url";
import { RATE_LIMITED, allowAttempt } from "@/lib/rate-limit";

/** The code after the password (§5.9): from the authenticator app, or one of the backup codes. */
export async function verifyLoginCodeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("code"))) return { error: RATE_LIMITED };
  const code = String(formField(formData, "code") ?? "").replaceAll(/\s/g, "");
  const backup = formField(formData, "backup") === "on";
  const state = await runAction(async () => {
    const options = { body: { code }, headers: await headers() };
    if (backup) await auth.api.verifyBackupCode(options);
    else await auth.api.verifyTOTP(options);
  });
  if (state.error) return state;
  redirect(safeCallbackURL(formField(formData, "callbackURL")?.toString()));
}
