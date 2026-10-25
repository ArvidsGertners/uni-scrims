// Server actions answer in the language of the request (§5.21).
import { DomainError, msg } from "@uni-scrims/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const locale = vi.hoisted(() => ({ getLocale: vi.fn() }));
vi.mock("../lib/locale.ts", () => locale);

const { invalidInput, runAction } = await import("../lib/action.ts");

afterEach(() => {
  locale.getLocale.mockReset();
});

describe("runAction", () => {
  it("renders domain errors in the language of the request", async () => {
    locale.getLocale.mockResolvedValue("en");
    await expect(
      runAction(async () => {
        throw new DomainError("CONFLICT", msg("teamLimitReached", { count: 5 }));
      }),
    ).resolves.toEqual({ error: expect.stringMatching(/^You're already in 5 teams/) });
    locale.getLocale.mockResolvedValue("de");
    await expect(
      runAction(async () => {
        throw new DomainError("CONFLICT", "teamNameTaken");
      }),
    ).resolves.toEqual({ error: "Der Teamname ist schon vergeben." });
  });

  it("maps Better Auth errors and unknown ones", async () => {
    locale.getLocale.mockResolvedValue("en");
    await expect(
      runAction(async () => {
        throw { body: { code: "INVALID_EMAIL_OR_PASSWORD" } };
      }),
    ).resolves.toEqual({ error: "The email address or password is wrong." });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runAction(async () => {
        throw new Error("boom");
      }),
    ).resolves.toEqual({ error: "Something went wrong. Please try again." });
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("does not read the language when the action succeeds", async () => {
    await expect(runAction(async () => {})).resolves.toEqual({ error: null, done: true });
    expect(locale.getLocale).not.toHaveBeenCalled();
  });
});

describe("invalidInput", () => {
  it("answers in the language of the request", async () => {
    locale.getLocale.mockResolvedValue("en");
    await expect(invalidInput()).resolves.toEqual({ error: "Invalid input." });
  });
});
