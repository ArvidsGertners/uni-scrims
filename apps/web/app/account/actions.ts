"use server";

import {
  deleteAccount,
  emailSchema,
  handOverCaptain,
  parseInput,
  passwordSchema,
  requireActiveAccountUser,
  resolveUploadDir,
  setNotificationPreferences,
  setThemePreference,
  updateRealName,
} from "@uni-scrims/core";
import { NotifType } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { setFlash } from "@/lib/flash";
import { parseNotificationForm } from "@/lib/notification-form";
import { RATE_LIMITED, allowAttempt } from "@/lib/rate-limit";
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

/** System, Hell or Dunkel (SPEC N-13); the whole layout renders anew with it (§5.16). */
export async function setThemeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const state = await runAction(async () => {
    await setThemePreference({ userId, theme: String(formField(formData, "theme") ?? "") });
  });
  if (state.error) return state;
  revalidatePath("/", "layout");
  return state;
}

/** Discord and mail per notification (SPEC N-14). */
export async function saveNotificationsAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const state = await runAction(async () => {
    await setNotificationPreferences({
      userId,
      preferences: parseNotificationForm(formData, Object.values(NotifType)),
      // The role the boxes were shown with (§5.17).
      shownAsCaptain: formField(formData, "shownAsCaptain") === "1",
    });
  });
  if (state.error) return state;
  await setFlash("Benachrichtigungen gespeichert");
  // The layout too: switching Discord off everywhere can take the DM banner away (§5.1).
  revalidatePath("/", "layout");
  return state;
}

/** The real name, until the certificate is uploaded (SPEC N-3). */
export async function updateRealNameAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const state = await runAction(async () => {
    await updateRealName({
      userId,
      firstName: String(formField(formData, "firstName") ?? ""),
      lastName: String(formField(formData, "lastName") ?? ""),
    });
  });
  if (state.error) return state;
  await setFlash("Name gespeichert");
  revalidatePath("/account");
  return state;
}

/** Sends a link to the new address; the old one stays until it is clicked (SPEC N-3). */
export async function changeEmailAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("mail"))) return { error: RATE_LIMITED };
  const userId = (await getSessionUserId()) ?? "";
  const state = await runAction(async () => {
    // Better Auth checks only the session; banned users may only delete (§7).
    await requireActiveAccountUser(userId);
    const newEmail = parseInput(emailSchema, formField(formData, "newEmail"));
    await auth.api.changeEmail({
      body: { newEmail, callbackURL: "/account?email=bestaetigt" },
      headers: await headers(),
    });
  });
  if (state.error) return state;
  await setFlash("Wir haben dir einen Link an die neue Adresse geschickt");
  revalidatePath("/account");
  return state;
}

/** With the current password; the other sessions end (SPEC N-3). */
export async function changePasswordAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await allowAttempt("login"))) return { error: RATE_LIMITED };
  const userId = (await getSessionUserId()) ?? "";
  const state = await runAction(async () => {
    // Better Auth checks only the session; banned users may only delete (§7).
    await requireActiveAccountUser(userId);
    const newPassword = parseInput(passwordSchema, formField(formData, "newPassword"));
    await auth.api.changePassword({
      body: {
        currentPassword: String(formField(formData, "currentPassword") ?? ""),
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  });
  if (state.error) return state;
  await setFlash("Passwort geändert");
  revalidatePath("/account");
  return state;
}

/** For a captain whose account is not complete yet, so the deletion is possible (SPEC N-3). */
export async function handOverCaptainAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const state = await runAction(async () => {
    await handOverCaptain({ userId, newCaptainId: String(formField(formData, "memberId") ?? "") });
  });
  if (state.error) return state;
  await setFlash("Captain-Rolle übertragen");
  revalidatePath("/account");
  return state;
}
