import { describe, expect, it } from "vitest";
import { isAllowedAuthPath } from "../lib/auth-paths.ts";

describe("isAllowedAuthPath", () => {
  it("allows the endpoints the app uses over HTTP", () => {
    for (const path of [
      "/sign-in/social",
      "/link-social",
      "/callback/:id",
      "/callback/discord",
      "/sign-out",
      "/get-session",
      "/error",
      "/verify-email",
      "/reset-password/:token",
      "/dev/sign-in",
    ]) {
      expect(isAllowedAuthPath(path, false), path).toBe(true);
    }
  });

  it("allows the account endpoints only from the server actions (§5.8)", () => {
    for (const path of [
      "/sign-up/email",
      "/sign-in/email",
      "/send-verification-email",
      "/request-password-reset",
      "/reset-password",
      "/change-password",
      "/change-email",
    ]) {
      expect(isAllowedAuthPath(path, true), path).toBe(true);
      expect(isAllowedAuthPath(path, false), path).toBe(false);
    }
  });

  it("rejects every other Better Auth endpoint, also from the server", () => {
    for (const path of [
      "/update-user",
      "/delete-user",
      "/unlink-account",
      "/list-accounts",
      "/list-sessions",
      "/revoke-sessions",
      "/get-access-token",
      "/refresh-token",
      "/account-info",
      "/set-password",
      "/verify-password",
      "/ok",
    ]) {
      expect(isAllowedAuthPath(path, false), path).toBe(false);
      expect(isAllowedAuthPath(path, true), path).toBe(false);
    }
  });
});
