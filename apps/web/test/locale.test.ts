// getLocale reads account, cookie and Accept-Language of the request (§5.21).
import { afterEach, describe, expect, it, vi } from "vitest";

const header = vi.hoisted(() => ({ headerUser: vi.fn() }));
vi.mock("../lib/header-user.ts", () => header);
const request = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  acceptLanguage: null as string | null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "locale" && request.cookie !== undefined ? { value: request.cookie } : undefined,
  }),
  headers: async () =>
    new Headers(request.acceptLanguage ? { "accept-language": request.acceptLanguage } : {}),
}));

const { getLocale, getMessages } = await import("../lib/locale.ts");

afterEach(() => {
  header.headerUser.mockReset();
  request.cookie = undefined;
  request.acceptLanguage = null;
});

describe("getLocale", () => {
  it("follows the browser without account and cookie", async () => {
    header.headerUser.mockResolvedValue(null);
    request.acceptLanguage = "en-GB,en;q=0.9";
    await expect(getLocale()).resolves.toBe("en");
  });

  it("prefers the cookie to the browser", async () => {
    header.headerUser.mockResolvedValue(null);
    request.cookie = "de";
    request.acceptLanguage = "en";
    await expect(getLocale()).resolves.toBe("de");
  });

  it("prefers the account to the cookie, and passes a null account on", async () => {
    header.headerUser.mockResolvedValue({ id: "u1", locale: "en" });
    request.cookie = "de";
    await expect(getLocale()).resolves.toBe("en");
    header.headerUser.mockResolvedValue({ id: "u1", locale: null });
    await expect(getLocale()).resolves.toBe("de");
  });

  it("picks the part of a dictionary", async () => {
    header.headerUser.mockResolvedValue(null);
    request.acceptLanguage = "en";
    await expect(getMessages({ de: "Hallo", en: "Hello" })).resolves.toBe("Hello");
  });
});
