"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { safeCallbackURL } from "@/lib/callback-url";
import { allowAttempt, rateLimited } from "@/lib/rate-limit";

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await allowAttempt("login"))) return rateLimited();
  const email = String(formField(formData, "email") ?? "");
  const password = String(formField(formData, "password") ?? "");
  let needsCode = false;
  const state = await runAction(async () => {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    // Staff with 2FA (§5.9): no session yet, the code comes next.
    needsCode = "twoFactorRedirect" in result && result.twoFactorRedirect === true;
  });
  if (state.error) return state;
  const callbackURL = safeCallbackURL(formField(formData, "callbackURL")?.toString());
  if (needsCode) redirect(`/login/2fa?callbackURL=${encodeURIComponent(callbackURL)}`);
  // An incomplete account lands on its setup from there (requirePageUser).
  redirect(callbackURL);
}
