import { INTL_LOCALES, type Locale } from "@uni-scrims/core/config/locale";
import { formatMessages } from "../i18n/format.ts";

const dateTimes = new Map<Locale, Intl.DateTimeFormat>();

/**
 * Date and time in Europe/Berlin (ARCHITECTURE §4). `suffix` adds "Uhr" in German, where a page
 * showed it before Phase 22; English has none (§5.21).
 */
export function formatDateTime(
  date: Date,
  locale: Locale,
  { suffix = false }: { suffix?: boolean } = {},
): string {
  let format = dateTimes.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      timeZone: "Europe/Berlin",
      dateStyle: "medium",
      timeStyle: "short",
    });
    dateTimes.set(locale, format);
  }
  return format.format(date) + (suffix ? formatMessages[locale].timeSuffix : "");
}

/** Initials for round user avatars: the first two letters or digits of the Discord name. */
export function initials(name: string): string {
  return (name.match(/[\p{L}\p{N}]/gu) ?? []).slice(0, 2).join("").toUpperCase();
}
