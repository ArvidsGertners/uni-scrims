"use server";

import { completeAccount, parseInput, passwordSchema, resolveUploadDir } from "@uni-scrims/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { safeCallbackURL } from "@/lib/callback-url";
import { setFlash } from "@/lib/flash";
import { setupActionMessages } from "@/i18n/account";
import { getMessages } from "@/lib/locale";
import { allowAttempt, rateLimited } from "@/lib/rate-limit";
import { getSessionUserId, setupUrl } from "@/lib/session";

/**
 * "Konto vervollständigen" for accounts from before Phase 7 (§5.8): the password is hashed by Better
 * Auth, core stores everything at once, then the confirmation link goes to the new address.
 */
export async function completeAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("mail"))) return rateLimited();
  const userId = (await getSessionUserId()) ?? "";
  const callbackURL = safeCallbackURL(formField(formData, "callbackURL")?.toString());
  const state = await runAction(async () => {
    const password = parseInput(passwordSchema, formField(formData, "password"));
    const { email } = await completeAccount({
      userId,
      firstName: String(formField(formData, "firstName") ?? ""),
      lastName: String(formField(formData, "lastName") ?? ""),
      email: String(formField(formData, "email") ?? ""),
      passwordHash: await (await auth.$context).password.hash(password),
      uploadDir: resolveUploadDir(),
      now: new Date(),
    });
    // The account is complete now; if the mail fails, the next page offers sending it again.
    try {
      await auth.api.sendVerificationEmail({ body: { email, callbackURL: setupUrl(callbackURL) } });
    } catch (error) {
      console.error("Could not send the confirmation after completing an account", error);
    }
  });
  if (state.error) return state;
  redirect(setupUrl(callbackURL));
}

/** The confirmation link once more, to the address of the signed-in account. */
export async function resendVerificationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("mail"))) return rateLimited();
  const callbackURL = safeCallbackURL(formField(formData, "callbackURL")?.toString());
  const state = await runAction(async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;
    await auth.api.sendVerificationEmail({
      body: { email: session.user.email, callbackURL: setupUrl(callbackURL) },
    });
  });
  if (state.error) return state;
  await setFlash((await getMessages(setupActionMessages)).linkSentAgain);
  redirect(setupUrl(callbackURL));
}
