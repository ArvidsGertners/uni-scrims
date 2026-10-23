import { DomainError } from "@uni-scrims/core";
import { describe, expect, it } from "vitest";
import { setupCommand, setupErrorText } from "../src/commands/setup.ts";

describe("/setup", () => {
  it("has one required text channel option and only works on servers", () => {
    expect(setupCommand.toJSON()).toMatchObject({
      name: "setup",
      // 0 = guild context only.
      contexts: [0],
      // 7 = channel option, 0 = text channel.
      options: [{ name: "channel", type: 7, required: true, channel_types: [0] }],
    });
  });

  it("sends users without an account to the website and shows core's other reasons", () => {
    const base = "https://scrims.example";
    expect(setupErrorText(new DomainError("UNAUTHENTICATED", "Bitte melde dich an."), base)).toBe(
      "Zu deinem Discord-Konto gibt es kein Uni-Scrims-Konto. Registriere dich unter https://scrims.example/register und verknüpfe dort Discord.",
    );
    expect(setupErrorText(new DomainError("FORBIDDEN", "Das kann nur euer Captain."), base)).toBe(
      "Das kann nur euer Captain.",
    );
  });
});
