"use server";

import { finishTwoFactorSetup, requireStaffMember } from "@uni-scrims/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { renderSVG } from "uqr";
import { type ActionState, formField, runAction } from "@/lib/action";
import { auth } from "@/lib/auth";
import { setFlash } from "@/lib/flash";
import { allowAttempt, rateLimited } from "@/lib/rate-limit";
import { adminLoginUrl, getSessionUserId } from "@/lib/session";

/** Step 1 hands the page what the authenticator app needs (§5.9). */
export type TwoFactorSetupState = ActionState & {
  setup?: { qrSvg: string; secret: string; backupCodes: string[] };
};

/** Confirms the password and creates the TOTP secret; only staff set up a 2FA (§5.9). */
export async function startTwoFactorAction(
  _state: TwoFactorSetupState,
  formData: FormData,
): Promise<TwoFactorSetupState> {
  if (!(await allowAttempt("code"))) return rateLimited();
  const userId = (await getSessionUserId()) ?? "";
  let setup: TwoFactorSetupState["setup"];
  const state = await runAction(async () => {
    await requireStaffMember(userId);
    const result = await auth.api.enableTwoFactor({
      body: { password: String(formField(formData, "password") ?? ""), method: "totp" },
      headers: await headers(),
    });
    if (result.method !== "totp") throw new Error("Better Auth did not set up TOTP");
    const { totpURI, backupCodes } = result;
    setup = {
      // uqr builds the SVG from the URI only; nothing user-supplied goes into it.
      qrSvg: renderSVG(totpURI, { border: 2 }),
      secret: new URL(totpURI).searchParams.get("secret") ?? "",
      backupCodes,
    };
  });
  return state.error ? state : { error: null, setup };
}

/**
 * The first code switches the 2FA on; the auth config then ends every session (core), here once
 * more for the one Better Auth just created, so the next login goes through password and code.
 */
export async function confirmTwoFactorAction(
  _state: TwoFactorSetupState,
  formData: FormData,
): Promise<TwoFactorSetupState> {
  if (!(await allowAttempt("code"))) return rateLimited();
  // Read before the code: Better Auth replaces the session when it switches the 2FA on.
  const userId = (await getSessionUserId()) ?? "";
  let enabled = false;
  const state = await runAction(async () => {
    await requireStaffMember(userId);
    const code = String(formField(formData, "code") ?? "").replaceAll(/\s/g, "");
    await auth.api.verifyTOTP({ body: { code }, headers: await headers() });
    enabled = await finishTwoFactorSetup(userId);
  });
  if (state.error) return state;
  // The role was removed or the 2FA reset while the code was checked.
  if (!enabled)
    return { error: "Die Zwei-Faktor-Anmeldung wurde zurückgesetzt. Lade die Seite neu." };
  await setFlash("Zwei-Faktor-Anmeldung eingerichtet. Melde dich jetzt mit Passwort und Code an");
  redirect(adminLoginUrl("/"));
}
