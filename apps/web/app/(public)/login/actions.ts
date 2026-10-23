"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { safeCallbackURL } from "@/lib/callback-url";
import { RATE_LIMITED, allowAttempt } from "@/lib/rate-limit";

export async function loginAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await allowAttempt("login"))) return { error: RATE_LIMITED };
  const email = String(formField(formData, "email") ?? "");
  const password = String(formField(formData, "password") ?? "");
  const state = await runAction(async () => {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  });
  if (state.error) return state;
  // An incomplete account lands on its setup from there (requirePageUser).
  redirect(safeCallbackURL(formField(formData, "callbackURL")?.toString()));
}
