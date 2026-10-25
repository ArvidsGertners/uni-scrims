"use server";

import { parseInput, passwordSchema } from "@uni-scrims/core";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { passwordMessages } from "@/i18n/public";
import { setFlash } from "@/lib/flash";
import { getMessages } from "@/lib/locale";

/** Sets the new password; Better Auth then ends all sessions (revokeSessionsOnPasswordReset). */
export async function resetPasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const state = await runAction(async () => {
    const newPassword = parseInput(passwordSchema, formField(formData, "password"));
    const token = String(formField(formData, "token") ?? "");
    await auth.api.resetPassword({ body: { newPassword, token } });
  });
  if (state.error) return state;
  await setFlash((await getMessages(passwordMessages)).changed);
  redirect("/login");
}
