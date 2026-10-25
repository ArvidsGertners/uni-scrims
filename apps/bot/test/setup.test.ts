import { DomainError } from "@uni-scrims/core";
import { describe, expect, it } from "vitest";
import { setupCommand, setupErrorText, setupLocales } from "../src/commands/setup.ts";

describe("/setup", () => {
  it("has a required text channel, an optional team with suggestions, and only works on servers", () => {
    expect(setupCommand.toJSON()).toMatchObject({
      name: "setup",
      // 0 = guild context only.
      contexts: [0],
      // 7 = channel option, 0 = text channel; 3 = string option (SPEC N-17).
      options: [
        { name: "channel", type: 7, required: true, channel_types: [0] },
        { name: "team", type: 3, required: false, autocomplete: true },
      ],
    });
  });

  it("sends users without an account to the website and shows core's other reasons", () => {
    const base = "https://scrims.example";
    expect(setupErrorText(new DomainError("UNAUTHENTICATED", "signInFirst"), base, "de")).toBe(
      "Zu deinem Discord-Konto gibt es kein Uni-Scrims-Konto. Registriere dich unter https://scrims.example/register und verknüpfe dort Discord.",
    );
    expect(setupErrorText(new DomainError("FORBIDDEN", "notCaptain"), base, "de")).toBe(
      "Das kann nur euer Captain.",
    );
  });

  it("is described in English for English Discord apps (§5.22)", () => {
    const json = setupCommand.toJSON();
    expect(json.description_localizations).toEqual({
      "en-GB": "Links a channel of this server with your Uni Scrims team",
      "en-US": "Links a channel of this server with your Uni Scrims team",
    });
    for (const option of json.options ?? []) {
      expect(option.description_localizations?.["en-GB"]).toMatch(/^[A-Z][a-z]/);
    }
  });

  it("answers in the account's language, else the Discord app's; posts in the captain's", () => {
    expect(setupLocales({ locale: "en" }, "de")).toEqual({ reply: "en", post: "en" });
    expect(setupLocales({ locale: "de" }, "en-GB")).toEqual({ reply: "de", post: "de" });
    expect(setupLocales({ locale: null }, "en-US")).toEqual({ reply: "en", post: "de" });
    expect(setupLocales(null, "en-GB")).toEqual({ reply: "en", post: "de" });
    expect(setupLocales(null, "fr")).toEqual({ reply: "de", post: "de" });
  });

  it("explains refusals in English", () => {
    const base = "https://scrims.example";
    expect(setupErrorText(new DomainError("UNAUTHENTICATED", "signInFirst"), base, "en")).toBe(
      "There's no Uni Scrims account for your Discord account. Sign up at https://scrims.example/register and link Discord there.",
    );
    expect(setupErrorText(new DomainError("FORBIDDEN", "notCaptain"), base, "en")).toBe(
      "Only your captain can do that.",
    );
  });
});
