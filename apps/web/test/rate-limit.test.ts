import { describe, expect, it } from "vitest";
import { RATE_LIMITS, takeAttempt } from "../lib/rate-limit.ts";

describe("takeAttempt", () => {
  it("allows the limit per window and key, then refuses until the window has passed", () => {
    const rule = RATE_LIMITS.mail;
    const key = `mail:${crypto.randomUUID()}`;
    const start = 1_000_000;
    for (let i = 0; i < rule.max; i++) expect(takeAttempt(key, rule, start + i)).toBe(true);
    expect(takeAttempt(key, rule, start + 10)).toBe(false);
    // Another IP has its own count.
    expect(takeAttempt(`mail:${crypto.randomUUID()}`, rule, start + 10)).toBe(true);
    // A refused attempt does not extend the wait.
    expect(takeAttempt(key, rule, start + rule.windowMs)).toBe(true);
  });
});
