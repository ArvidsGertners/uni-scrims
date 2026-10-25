import { DomainError } from "@uni-scrims/core";
import { describe, expect, it } from "vitest";
import { setupCommand, setupErrorText } from "../src/commands/setup.ts";

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
    expect(setupErrorText(new DomainError("UNAUTHENTICATED", "signInFirst"), base)).toBe(
      "Zu deinem Discord-Konto gibt es kein Uni-Scrims-Konto. Registriere dich unter https://scrims.example/register und verknüpfe dort Discord.",
    );
    expect(setupErrorText(new DomainError("FORBIDDEN", "notCaptain"), base)).toBe(
      "Das kann nur euer Captain.",
    );
  });
});
