import { DEFAULT_LOCALE, type Locale, isLocale } from "@uni-scrims/core/config/locale";

/**
 * The language among ours that the browser prefers (§5.21): Accept-Language entries by q-value, on
 * a tie the earlier one; only the primary subtag counts ("en-GB" is English). Entries with q=0 or an
 * invalid q-value are skipped. Null if the header names neither language.
 */
export function preferredLocale(header: string | null | undefined): Locale | null {
  if (!header) return null;
  let best: { locale: Locale; q: number } | null = null;
  for (const entry of header.split(",")) {
    const [tag = "", ...params] = entry.split(";");
    const language = tag.trim().toLowerCase().split("-")[0];
    if (!isLocale(language)) continue;
    let q = 1;
    for (const param of params) {
      const [name = "", value = ""] = param.split("=");
      if (name.trim().toLowerCase() === "q") q = value.trim() === "" ? Number.NaN : Number(value);
    }
    // NaN fails both comparisons.
    if (!(q > 0 && q <= 1)) continue;
    if (!best || q > best.q) best = { locale: language, q };
  }
  return best?.locale ?? null;
}

/** The order of §5.21: the account's choice, then the cookie, then the browser, then German. */
export function resolveLocale(input: {
  account: Locale | null;
  cookie: string | undefined;
  acceptLanguage: string | null;
}): Locale {
  if (input.account) return input.account;
  if (isLocale(input.cookie)) return input.cookie;
  return preferredLocale(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

/** The language cookie (§5.21) from a Cookie header; set only by setLocaleAction. */
function localeCookie(cookieHeader: string | null): string | undefined {
  for (const pair of cookieHeader?.split(";") ?? []) {
    const [name, value] = pair.trim().split("=");
    if (name === "locale") return value;
  }
  return undefined;
}

/**
 * The language a request shows without an account's choice: the cookie, then Accept-Language, then
 * German. For sign-ins of accounts that have no language yet (§5.22).
 */
export function localeFromHeaders(headers: Headers): Locale {
  return resolveLocale({
    account: null,
    cookie: localeCookie(headers.get("cookie")),
    acceptLanguage: headers.get("accept-language"),
  });
}
