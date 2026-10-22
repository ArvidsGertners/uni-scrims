"use server";

import { deleteAccount, resolveUploadDir } from "@uni-scrims/core";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

export async function deleteAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  if (formField(formData, "confirm") !== "on") {
    return { error: "Bitte bestätige, dass du dein Konto löschen willst." };
  }
  const state = await runAction(async () => {
    await deleteAccount({ userId, uploadDir: resolveUploadDir(), now: new Date() });
  });
  if (state.error) return state;
  // The sessions are gone, so the user is logged out from here on.
  redirect("/?geloescht=1");
}
