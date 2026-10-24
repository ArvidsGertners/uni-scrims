import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeCallbackURL } from "../lib/callback-url.ts";

describe("safeCallbackURL", () => {
  it("keeps same-site paths", () => {
    expect(safeCallbackURL("/join/abc123")).toBe("/join/abc123");
    expect(safeCallbackURL("/team?x=1#y")).toBe("/team?x=1#y");
  });

  it("rejects other hosts, also with tricks the URL parser strips", () => {
    for (const value of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "evil.com",
    ]) {
      expect(safeCallbackURL(value)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });

  it("falls back for missing or repeated parameters", () => {
    expect(safeCallbackURL(undefined)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeCallbackURL(["/a", "/b"])).toBe(DEFAULT_AFTER_LOGIN);
  });

  describe("with ADMIN_URL (§5.13)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("allows absolute addresses of the admin host, nothing else absolute", () => {
      vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.com");
      vi.stubEnv("ADMIN_URL", "https://admin.uniscrims.com");
      expect(safeCallbackURL("https://admin.uniscrims.com/bans?q=1")).toBe(
        "https://admin.uniscrims.com/bans?q=1",
      );
      for (const value of [
        "https://uniscrims.com/team",
        "https://admin.uniscrims.com.evil.com/",
        "https://admin.uniscrims.com@evil.com/",
        "http://admin.uniscrims.com/",
        "https://evil.com",
      ]) {
        expect(safeCallbackURL(value), value).toBe(DEFAULT_AFTER_LOGIN);
      }
    });

    it("rejects the admin host without ADMIN_URL", () => {
      vi.stubEnv("ADMIN_URL", "");
      expect(safeCallbackURL("https://admin.uniscrims.com/")).toBe(DEFAULT_AFTER_LOGIN);
    });
  });
});
