import { getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "../proxy.ts";

function request(url: string, init: { method?: string } = {}) {
  return new NextRequest(url, { ...init, headers: { host: new URL(url).host } });
}

function redirectTarget(response: Response): string | null {
  return response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy without ADMIN_URL", () => {
  it("leaves /admin on the main host", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.com");
    vi.stubEnv("ADMIN_URL", "");
    const response = proxy(request("https://uniscrims.com/admin/bans"));
    expect(isRewrite(response)).toBe(false);
    expect(redirectTarget(response)).toBeNull();
  });
});

describe("proxy with ADMIN_URL (§5.13)", () => {
  beforeEach(() => {
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.com");
    vi.stubEnv("ADMIN_URL", "https://admin.uniscrims.com");
  });

  it("rewrites the admin host onto the admin routes, also for actions", () => {
    for (const [path, target] of [
      ["/", "/admin"],
      ["/bans?q=ana", "/admin/bans?q=ana"],
      ["/2fa", "/admin/2fa"],
    ] as const) {
      const response = proxy(request(`https://admin.uniscrims.com${path}`));
      expect(isRewrite(response), path).toBe(true);
      const rewritten = new URL(getRewrittenUrl(response)!);
      expect(rewritten.pathname + rewritten.search).toBe(target);
    }
    const action = proxy(request("https://admin.uniscrims.com/bans", { method: "POST" }));
    expect(new URL(getRewrittenUrl(action)!).pathname).toBe("/admin/bans");
  });

  it("lets the legal pages and support through on the admin host", () => {
    for (const path of ["/impressum", "/datenschutz", "/support"]) {
      const response = proxy(request(`https://admin.uniscrims.com${path}`));
      expect(isRewrite(response), path).toBe(false);
      expect(redirectTarget(response), path).toBeNull();
    }
  });

  it("drops the /admin prefix on the admin host", () => {
    expect(redirectTarget(proxy(request("https://admin.uniscrims.com/admin/stats")))).toBe(
      "https://admin.uniscrims.com/stats",
    );
    expect(redirectTarget(proxy(request("https://admin.uniscrims.com/admin")))).toBe(
      "https://admin.uniscrims.com/",
    );
  });

  it("keeps redirects on the admin host, also for a path starting with two slashes", () => {
    for (const url of [
      "https://uniscrims.com/admin//evil.com",
      "https://admin.uniscrims.com/admin//evil.com",
    ]) {
      const target = new URL(redirectTarget(proxy(request(url)))!);
      expect(target.origin, url).toBe("https://admin.uniscrims.com");
      expect(target.pathname, url).toBe("//evil.com");
    }
  });

  it("sends /admin on the main host to the admin host", () => {
    expect(redirectTarget(proxy(request("https://uniscrims.com/admin/bans?q=ana")))).toBe(
      "https://admin.uniscrims.com/bans?q=ana",
    );
    expect(redirectTarget(proxy(request("https://uniscrims.com/admin")))).toBe(
      "https://admin.uniscrims.com/",
    );
  });

  it("leaves the rest of the main host alone", () => {
    for (const path of ["/", "/scrims", "/administration", "/login"]) {
      const response = proxy(request(`https://uniscrims.com${path}`));
      expect(isRewrite(response), path).toBe(false);
      expect(redirectTarget(response), path).toBeNull();
    }
  });
});
