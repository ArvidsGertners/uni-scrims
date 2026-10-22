import { describe, expect, it } from "vitest";
import { isAllowedAuthPath } from "../lib/auth-paths.ts";

describe("isAllowedAuthPath", () => {
  it("allows the endpoints the app uses", () => {
    for (const path of [
      "/sign-in/social",
      "/callback/:id",
      "/callback/discord",
      "/sign-out",
      "/get-session",
      "/error",
      "/dev/sign-in",
    ]) {
      expect(isAllowedAuthPath(path)).toBe(true);
    }
  });

  it("rejects every other Better Auth endpoint", () => {
    for (const path of [
      "/update-user",
      "/change-email",
      "/delete-user",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/list-sessions",
      "/revoke-sessions",
      "/get-access-token",
      "/refresh-token",
      "/account-info",
      "/sign-in/email",
      "/sign-up/email",
      "/ok",
    ]) {
      expect(isAllowedAuthPath(path)).toBe(false);
    }
  });
});
