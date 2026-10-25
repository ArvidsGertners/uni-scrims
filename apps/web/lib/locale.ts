import { type Message, renderMessage } from "@uni-scrims/core";
import type { Locale, Localized } from "@uni-scrims/core/config/locale";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, resolveLocale } from "./accept-language.ts";
import { headerUser } from "./header-user.ts";

export { LOCALE_COOKIE } from "./accept-language.ts";

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

type RenderText = {
  (message: Message): string;
  (message: Message | null): string | null;
};

/** Renders messages of core (errors, problems) in the language of this request (§5.21). */
export async function getText(): Promise<RenderText> {
  const locale = await getLocale();
  return ((message: Message | null) =>
    message ? renderMessage(message, locale) : null) as RenderText;
}
