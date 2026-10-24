import { afterEach, describe, expect, it, vi } from "vitest";
import {
  adminHref,
  adminOrigin,
  adminUrl,
  isAdminHost,
  mainUrl,
  sharedCookieDomain,
} from "../lib/admin-url.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin addresses (§5.13)", () => {
  it("keeps everything under /admin without ADMIN_URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.com");
    vi.stubEnv("ADMIN_URL", "");
    expect(adminOrigin()).toBeNull();
    expect(adminHref("/")).toBe("/admin");
    expect(adminHref("/bans")).toBe("/admin/bans");
    expect(adminUrl("/2fa")).toBe("/admin/2fa");
    expect(mainUrl("/scrims")).toBe("/scrims");
    expect(sharedCookieDomain()).toBeNull();
    expect(isAdminHost("uniscrims.com")).toBe(false);
  });

  it("uses the admin host with ADMIN_URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.com");
    vi.stubEnv("ADMIN_URL", "https://admin.uniscrims.com");
    expect(adminOrigin()).toBe("https://admin.uniscrims.com");
    expect(adminHref("/")).toBe("/");
    expect(adminHref("/bans")).toBe("/bans");
    expect(adminUrl("/bans")).toBe("https://admin.uniscrims.com/bans");
    expect(mainUrl("/login?x=1")).toBe("https://uniscrims.com/login?x=1");
    expect(sharedCookieDomain()).toBe("uniscrims.com");
    expect(isAdminHost("admin.uniscrims.com")).toBe(true);
    expect(isAdminHost("uniscrims.com")).toBe(false);
    expect(isAdminHost(null)).toBe(false);
  });

  it("refuses an admin address outside the main domain", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.com");
    for (const value of [
      "https://admin.example.com",
      "https://uniscrims.com",
      "https://evil-uniscrims.com",
      "http://admin.uniscrims.com",
    ]) {
      vi.stubEnv("ADMIN_URL", value);
      expect(() => adminOrigin(), value).toThrow(/subdomain/);
    }
  });
});
