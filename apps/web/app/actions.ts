"use server";

import { isLocale, setLocalePreference } from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { runAction } from "@/lib/action";
import { sharedCookieDomain } from "@/lib/admin-url";
import { LOCALE_COOKIE } from "@/lib/locale";
import { getSessionUserId } from "@/lib/session";

/**
 * The language menu (§5.21): the cookie for this browser, for everyone; signed in also the account,
 * so the choice holds on every device. The cookie is only set by this explicit choice.
 */
export async function setLocaleAction(value: string): Promise<void> {
  if (!isLocale(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    // The same choice on the admin host (§5.13).
    domain: sharedCookieDomain() ?? undefined,
  });
  const userId = await getSessionUserId();
  // A deleted or vanished account keeps the cookie only; runAction swallows that error.
  if (userId) await runAction(() => setLocalePreference({ userId, locale: value }));
  // Like the design: the layout and every cached page render again in the new language.
  revalidatePath("/", "layout");
}
