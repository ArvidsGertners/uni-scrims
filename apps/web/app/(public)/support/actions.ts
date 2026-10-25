"use server";

import { submitTeamLimitRequest } from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { type ActionState, formField, runAction } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { getSessionUserId } from "@/lib/session";

/** „Mehr Teams beantragen“ (SPEC N-17); core checks the account, the reason and one open request. */
export async function submitTeamLimitRequestAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const reason = String(formField(formData, "reason") ?? "");
  const state = await runAction(async () => {
    await submitTeamLimitRequest({ userId, reason, now: new Date() });
  });
  if (state.done) await setFlash("Antrag gesendet");
  revalidatePath("/support");
  return state;
}
