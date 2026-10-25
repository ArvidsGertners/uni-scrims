"use server";

import { NEW_ACCOUNT_NAME, parseInput, registrationSchema, toDbLocale } from "@uni-scrims/core";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { safeCallbackURL } from "@/lib/callback-url";
import { getLocale } from "@/lib/locale";
import { allowAttempt, rateLimited } from "@/lib/rate-limit";
import { setupUrl } from "@/lib/session";

/**
 * Registration (SPEC N-3): validated in core, then Better Auth on the server, which sends the
 * confirmation link. A taken address gets the same answer as a new one.
 */
export async function registerAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("register"))) return rateLimited();
  const callbackURL = safeCallbackURL(formField(formData, "callbackURL")?.toString());
  const state = await runAction(async () => {
    const input = parseInput(registrationSchema, {
      firstName: formField(formData, "firstName"),
      lastName: formField(formData, "lastName"),
      email: formField(formData, "email"),
      password: formField(formData, "password"),
      consent: formField(formData, "consent") === "on",
    });
    await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        // Replaced by the Discord name once Discord is linked; never the real name (§5.8).
        name: NEW_ACCOUNT_NAME,
        firstName: input.firstName,
        lastName: input.lastName,
        locale: toDbLocale(await getLocale()),
        // The confirmation link signs in and continues with linking Discord.
        callbackURL: setupUrl(callbackURL),
      },
    });
  });
  if (state.error) return state;
  redirect("/register/sent");
}
