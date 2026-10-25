"use server";

import { isDomainError, isLocale, setLocalePreference } from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sharedCookieDomain } from "@/lib/admin-url";
import { LOCALE_COOKIE } from "@/lib/locale";
import { getSessionUserId } from "@/lib/session";

/**
 * The language menu (§5.21): the cookie for this browser, for everyone; signed in also the account,
 * so the choice holds on every device. The cookie is only set by this explicit choice. False when
 * the account could not be saved: its language would still win over the cookie.
 */
export async function setLocaleAction(value: string): Promise<boolean> {
  if (!isLocale(value)) return false;
  (await cookies()).set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    // The same choice on the admin host (§5.13).
    domain: sharedCookieDomain() ?? undefined,
  });
  const userId = await getSessionUserId();
  if (userId) {
    try {
      await setLocalePreference({ userId, locale: value });
    } catch (error) {
      // An account that counts as signed out (deleted, Discord not linked yet) has no language of
      // its own for getLocale either; the cookie decides there.
      if (!isDomainError(error)) {
        console.error("Could not save the language of the account", error);
        return false;
      }
    }
  }
  // Like the design: the layout and every cached page render again in the new language.
  revalidatePath("/", "layout");
  return true;
}
