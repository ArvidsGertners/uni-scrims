import type { Locale, Localized } from "@uni-scrims/core/config/locale";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { resolveLocale } from "./accept-language.ts";
import { headerUser } from "./header-user.ts";

/** The language chosen in this browser (§5.21); set only by setLocaleAction. */
export const LOCALE_COOKIE = "locale";

/** The language of this request (§5.21), once per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  const [user, cookieStore, headerList] = await Promise.all([headerUser(), cookies(), headers()]);
  return resolveLocale({
    account: user?.locale ?? null,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });
});

/** The part of a dictionary for the language of this request. */
export async function getMessages<T>(dictionary: Localized<T>): Promise<T> {
  return dictionary[await getLocale()];
}
