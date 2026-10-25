// The stored language of an account (Phase 22, §5.21). Only this file knows the Prisma enum; the rest
// of the code works with "de" | "en".
import { Locale as DbLocale } from "@uni-scrims/db";
import type { Locale } from "../../config/locale.ts";

const TO_DB: Record<Locale, DbLocale> = { de: DbLocale.DE, en: DbLocale.EN };

export function toDbLocale(locale: Locale): DbLocale {
  return TO_DB[locale];
}

export function fromDbLocale(locale: DbLocale | null): Locale | null {
  if (locale === null) return null;
  return locale === DbLocale.EN ? "en" : "de";
}
