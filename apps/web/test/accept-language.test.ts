// Which language a request gets (§5.21): account, cookie, browser, German.
import { describe, expect, it } from "vitest";
import { localeFromHeaders, preferredLocale, resolveLocale } from "../lib/accept-language.ts";

describe("preferredLocale", () => {
  it.each([
    ["en-US,en;q=0.9,de;q=0.8", "en"],
    ["de-DE,de;q=0.9,en;q=0.8", "de"],
    ["fr-FR,fr;q=0.9,en;q=0.5", "en"],
    ["EN-gb", "en"],
    ["en;q=0.5,de;q=0.7", "de"],
    ["en,de", "en"],
    ["de, en", "de"],
    ["en;q=0.8,de;q=0.8", "en"],
    ["de;q=0,en;q=0.1", "en"],
    ["en;q=abc,de;q=0.2", "de"],
    ["en;q=,de;q=0.2", "de"],
    ["en;q=1.5,de;q=0.2", "de"],
  ])("%s → %s", (header, locale) => {
    expect(preferredLocale(header)).toBe(locale);
  });

  it.each([null, undefined, "", "fr", "*", "de;q=0", "english", "deu"])(
    "%s names neither language",
    (header) => {
      expect(preferredLocale(header)).toBeNull();
    },
  );
});

describe("resolveLocale", () => {
  const english = "en-US,en;q=0.9";

  it("takes the account's language before cookie and browser", () => {
    expect(resolveLocale({ account: "de", cookie: "en", acceptLanguage: english })).toBe("de");
  });

  it("takes the cookie before the browser", () => {
    expect(resolveLocale({ account: null, cookie: "de", acceptLanguage: english })).toBe("de");
    expect(resolveLocale({ account: null, cookie: "en", acceptLanguage: "de" })).toBe("en");
  });

  it("ignores an invalid cookie", () => {
    expect(resolveLocale({ account: null, cookie: "fr", acceptLanguage: english })).toBe("en");
  });

  it("falls back to German", () => {
    expect(resolveLocale({ account: null, cookie: undefined, acceptLanguage: null })).toBe("de");
    expect(resolveLocale({ account: null, cookie: undefined, acceptLanguage: "fr" })).toBe("de");
  });
});

describe("localeFromHeaders (§5.22)", () => {
  it("takes the cookie, then Accept-Language, then German", () => {
    expect(
      localeFromHeaders(new Headers({ cookie: "a=1; locale=en; b=2", "accept-language": "de" })),
    ).toBe("en");
    expect(
      localeFromHeaders(new Headers({ cookie: "locale=fr", "accept-language": "en-GB" })),
    ).toBe("en");
    expect(localeFromHeaders(new Headers({ "accept-language": "fr" }))).toBe("de");
    // Neither cookie nor Accept-Language, like a link scanner: nothing to adopt.
    expect(localeFromHeaders(new Headers({ cookie: "other=en" }))).toBeNull();
    expect(localeFromHeaders(new Headers())).toBeNull();
  });
});
