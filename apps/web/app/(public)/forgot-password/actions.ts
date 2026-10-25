"use server";

import { emailSchema, parseInput } from "@uni-scrims/core";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { allowAttempt, rateLimited } from "@/lib/rate-limit";

/** Sends the link if the address exists; the answer is the same either way (SPEC N-3). */
export async function forgotPasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("mail"))) return rateLimited();
  const state = await runAction(async () => {
    const email = parseInput(emailSchema, formField(formData, "email"));
    // Better Auth checks the token at /reset-password/:token and redirects here with ?token=.
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
  });
  if (state.error) return state;
  redirect("/forgot-password?gesendet=1");
}
