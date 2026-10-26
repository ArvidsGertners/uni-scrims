// The message catalog (ARCHITECTURE §5.21): every key in both languages, no German in English.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LOCALES } from "../config/locale.ts";
import { MESSAGES } from "../src/i18n/messages.ts";
import {
  AUTO_REJECT_REASON,
  DELETED_USER_NAME,
  DomainError,
  FEEDBACK_OUTCOME_LABELS,
  LOCALE_LABELS,
  LOGO_BACKGROUND_LABELS,
  MEMBER_ROLE_LABELS,
  METRIC_TEXTS,
  NEW_ACCOUNT_NAME,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_TITLES,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_SETTING_LABELS,
  NOTIFICATION_TYPE_LABELS,
  NOTIF_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  SCRIM_FORMAT_LABELS,
  SCRIM_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  TEAM_LIMIT_STATUS_LABELS,
  TEAM_LINK_TEXTS,
  THEME_LABELS,
  VERIF_STATUS_LABELS,
  notificationSettingLabel,
  rejectReasonText,
  userDisplayName,
  type MessageKey,
  type MessageParams,
  isMessageKey,
  key,
  msg,
  parseInput,
  renderMessage,
  teamLinksSchema,
} from "../src/index.ts";

type ParamKey = {
  [K in MessageKey]: MessageParams<K> extends undefined ? never : K;
}[MessageKey];

// tsc demands a sample for every key with parameters.
const SAMPLES: { [K in ParamKey]: MessageParams<K> } = {
  teamLimitReached: { count: 7 },
  startTooSoon: { minutes: 30 },
  applicantTeamInactive: { team: "Team Probe" },
  applicantsMustBeFullyVerified: { team: "Team Probe" },
  applicantTeamNotFullyVerified: { team: "Team Probe" },
  requestingTeamInactive: { team: "Team Probe" },
  readyWindowTimeInvalid: { minutes: 30 },
  teamLinkTooLong: { platform: "discord" },
  teamLinkInvalid: { platform: "website" },
  teamLinkNotHttps: { platform: "x" },
  teamLinkCredentials: { platform: "twitch" },
  teamLinkWrongHost: { platform: "tiktok" },
  newLimitRange: { min: 6 },
};

/** Umlauts, ß and the German opening quote; English uses “ ” like German closes. */
const GERMAN = /[äöüÄÖÜß„]/;

function allMessages() {
  return (Object.keys(MESSAGES.de) as MessageKey[]).map((messageKey) => {
    const params = (SAMPLES as Record<string, unknown>)[messageKey];
    return { key: messageKey, params } as Parameters<typeof renderMessage>[0];
  });
}

describe("message catalog", () => {
  it("renders every key in both languages, with the parameters in the text", () => {
    for (const message of allMessages()) {
      for (const locale of LOCALES) {
        const text = renderMessage(message, locale);
        expect(text, `${locale}.${message.key}`).toMatch(/\S/);
        for (const value of Object.values(message.params ?? {})) {
          if (typeof value !== "string" || message.key.startsWith("teamLink")) continue;
          expect(text, `${locale}.${message.key}`).toContain(value);
        }
      }
    }
  });

  it("has no German in English and translates every text", () => {
    for (const message of allMessages()) {
      const english = renderMessage(message, "en");
      expect(english, message.key).not.toMatch(GERMAN);
      expect(english, message.key).not.toBe(renderMessage(message, "de"));
    }
  });

  it("names the platform of a team link in each language", () => {
    const message = msg("teamLinkWrongHost", { platform: "discord" });
    expect(renderMessage(message, "de")).toMatch(/^Discord-Server: Bitte einen Einladungslink/);
    expect(renderMessage(message, "en")).toMatch(/^Discord server: Please enter an invite link/);
  });
});

describe("DomainError", () => {
  it("keeps the German text as message and the key for the UI", () => {
    const error = new DomainError("CONFLICT", msg("teamLimitReached", { count: 5 }));
    expect(error.text).toEqual({ key: "teamLimitReached", params: { count: 5 } });
    expect(error.message).toMatch(/^Du bist schon in 5 Teams/);
    expect(new DomainError("INVALID", "teamNameTaken")).toMatchObject({
      text: { key: "teamNameTaken" },
      message: "Der Teamname ist schon vergeben.",
    });
  });
});

describe("parseInput", () => {
  it("turns the key of the first issue into the message", () => {
    const schema = z.string(key("teamNameTooShort")).min(2, key("teamNameTooShort"));
    expect(() => parseInput(schema, "a")).toThrow(
      expect.objectContaining({ code: "INVALID", text: { key: "teamNameTooShort" } }),
    );
  });

  it("takes the parameters of custom issues", () => {
    expect(() => parseInput(teamLinksSchema, { x: "instagram.com/team" })).toThrow(
      expect.objectContaining({
        text: { key: "teamLinkWrongHost", params: { platform: "x" } },
      }),
    );
  });

  it("falls back to invalid input for zod's own messages", () => {
    expect(() => parseInput(z.number(), "a")).toThrow(
      expect.objectContaining({ text: { key: "invalidInput" }, message: "Ungültige Eingabe." }),
    );
  });

  it("knows only the catalog's keys", () => {
    expect(isMessageKey("teamNameTaken")).toBe(true);
    expect(isMessageKey("toString")).toBe(false);
    expect(isMessageKey("Ungültige Eingabe.")).toBe(false);
  });
});

/** Every string inside a dictionary entry, recursively. */
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(texts);
  return [];
}

describe("labels and texts of core", () => {
  const dictionaries = {
    FEEDBACK_OUTCOME_LABELS,
    LOCALE_LABELS,
    LOGO_BACKGROUND_LABELS,
    MEMBER_ROLE_LABELS,
    METRIC_TEXTS,
    NOTIFICATION_CATEGORY_TITLES,
    NOTIFICATION_CHANNEL_LABELS,
    NOTIFICATION_SETTING_LABELS,
    NOTIFICATION_TYPE_LABELS,
    NOTIF_STATUS_LABELS,
    REQUEST_STATUS_LABELS,
    SCRIM_FORMAT_LABELS,
    SCRIM_STATUS_LABELS,
    STAFF_ROLE_LABELS,
    TEAM_LIMIT_STATUS_LABELS,
    TEAM_LINK_TEXTS,
    THEME_LABELS,
    VERIF_STATUS_LABELS,
  };

  it("has no German in English", () => {
    for (const [name, dictionary] of Object.entries(dictionaries)) {
      for (const text of texts(dictionary.en)) expect(text, name).not.toMatch(GERMAN);
    }
  });

  it("names every notification type of the settings in both languages", () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const { type } of category.types) {
        expect(notificationSettingLabel(type, "de")).toMatch(/\S/);
        expect(notificationSettingLabel(type, "en")).toMatch(/\S/);
      }
    }
  });
});

describe("texts stored in the database", () => {
  it("shows the placeholders and fixed reasons translated, everything else as stored", () => {
    expect(userDisplayName(DELETED_USER_NAME, "en")).toBe("Deleted user");
    expect(userDisplayName(NEW_ACCOUNT_NAME, "en")).toBe("New account");
    expect(userDisplayName(NEW_ACCOUNT_NAME, "de")).toBe("Neues Konto");
    expect(userDisplayName("ana.muster", "en")).toBe("ana.muster");
    expect(rejectReasonText(AUTO_REJECT_REASON, "en")).toBe("Not reviewed in time");
    expect(rejectReasonText("Bescheinigung unleserlich", "en")).toBe("Bescheinigung unleserlich");
    expect(rejectReasonText("toString", "en")).toBe("toString");
  });
});
