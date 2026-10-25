"use client";

import { DEFAULT_LOCALE, type Locale, type Localized } from "@uni-scrims/core/config/locale";
import { type ReactNode, createContext, useContext } from "react";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** The language of the request for client components (§5.21); the root layout passes it down. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The part of a client dictionary (i18n/client.ts, i18n/common.ts) for the current language. */
export function useMessages<T>(dictionary: Localized<T>): T {
  return dictionary[useLocale()];
}
