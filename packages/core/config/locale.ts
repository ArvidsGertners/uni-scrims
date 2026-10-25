// The languages of the site (ARCHITECTURE §5.21). Free of imports, so client components can use it.

export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** German is the template of every dictionary and the language without any other signal. */
export const DEFAULT_LOCALE: Locale = "de";

/** One value per language; dictionaries type `en` as `typeof de`, so tsc finds missing entries. */
export type Localized<T> = Readonly<Record<Locale, T>>;

export function isLocale(value: unknown): value is Locale {
  return value === "de" || value === "en";
}

/** Intl locales: en-GB for day-first dates and the 24-hour clock. */
export const INTL_LOCALES: Localized<string> = { de: "de-DE", en: "en-GB" };

/** The languages in their own language, never translated (language menu). */
export const LANGUAGE_NAMES: Localized<string> = { de: "Deutsch", en: "English" };

/** A dictionary with German as the template: English must have exactly its entries (tsc checks). */
export function dictionary<T>(de: T, en: NoInfer<T>): Localized<T> {
  return { de, en };
}
