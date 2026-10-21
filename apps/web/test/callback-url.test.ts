import { describe, expect, it } from "vitest";
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
});
