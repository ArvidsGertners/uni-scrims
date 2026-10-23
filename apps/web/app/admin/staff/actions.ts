"use server";

import {
  ASSIGNABLE_STAFF_ROLES,
  type AssignableStaffRole,
  resetStaffTwoFactor,
  setStaffRole,
} from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { getSessionUserId } from "@/lib/session";

/** Gives, changes or removes ("none") a role; core checks the operator (§5.9). */
export async function setStaffRoleAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const operatorId = (await getSessionUserId()) ?? "";
  const userId = idSchema.safeParse(formField(formData, "userId"));
  const value = String(formField(formData, "role") ?? "");
  const role = value === "none" ? null : (value as AssignableStaffRole);
  if (!userId.success || (role !== null && !ASSIGNABLE_STAFF_ROLES.includes(role))) {
    return invalidInput;
  }
  const state = await runAction(async () => {
    await setStaffRole({ operatorId, userId: userId.data, role });
  });
  if (state.error) return state;
  await setFlash(role ? "Rolle gespeichert" : "Rolle entzogen");
  revalidatePath("/admin/staff");
  return state;
}

export async function resetStaffTwoFactorAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const operatorId = (await getSessionUserId()) ?? "";
  const userId = idSchema.safeParse(formField(formData, "userId"));
  if (!userId.success) return invalidInput;
  const state = await runAction(async () => {
    await resetStaffTwoFactor({ operatorId, userId: userId.data });
  });
  if (state.error) return state;
  await setFlash("2FA zurückgesetzt");
  revalidatePath("/admin/staff");
  return state;
}
