import type { OutboxMessage } from "@uni-scrims/core";
import { NotifType } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import type { MessageOf } from "../src/messages/common.ts";
import { buildMessage } from "../src/messages/index.ts";

const BASE_URL = "https://scrims.example";
// Thu 22.10.2026, 20:00 Berlin.
const STARTS_AT = "2026-10-22T18:00:00.000Z";
const START_TEXT = "Do, 22.10.2026, 20:00 Uhr";

const scrimPayload = { opponentTeamName: "Die Bären", startsAt: STARTS_AT, format: "BO3" } as const;
const requestPayload = { teamName: "Die Bären", startsAt: STARTS_AT };

const payloads: { [T in NotifType]: MessageOf<T>["payload"] } = {
  VERIFICATION_RESULT: { approved: true, rejectReason: null },
  APPLICATION_RECEIVED: requestPayload,
  APPLICATION_REJECTED: requestPayload,
  REQUEST_DELETED: requestPayload,
  REQUEST_EXPIRED: requestPayload,
  SCRIM_BOOKED: scrimPayload,
  SCRIM_CANCELLED: scrimPayload,
  REMINDER_24H: scrimPayload,
  REMINDER_1H: scrimPayload,
  FEEDBACK_PROMPT: scrimPayload,
  CHANNEL_BROKEN: { teamName: "Die Bären" },
};

function sample<T extends NotifType>(
  type: T,
  overrides: Partial<Omit<MessageOf<T>, "type">> = {},
): OutboxMessage {
  return {
    id: "notification-1",
    type,
    payload: payloads[type],
    recipient: { kind: "DM", userId: "user-1", discordId: "111", redirectedFrom: null },
    requestId: "request-1",
    scrimId: "scrim-1",
    opponentCaptain: { name: "captain_b", discordId: "222" },
    feedbackDeadline: new Date("2026-10-25T21:00:00.000Z"),
    ...overrides,
  } as OutboxMessage;
}

function embedOf(message: OutboxMessage) {
  return buildMessage(message, BASE_URL).embeds![0]!;
}

function linkOf(message: OutboxMessage) {
  const row = buildMessage(message, BASE_URL).components![0] as {
    components: { style: number; url?: string; label?: string }[];
  };
  return row.components[0]!;
}

const LINKS: Record<NotifType, string> = {
  VERIFICATION_RESULT: "/verify",
  APPLICATION_RECEIVED: "/requests/request-1",
  APPLICATION_REJECTED: "/scrims",
  REQUEST_DELETED: "/scrims",
  REQUEST_EXPIRED: "/scrims",
  SCRIM_BOOKED: "/scrims/scrim-1",
  SCRIM_CANCELLED: "/scrims/scrim-1",
  REMINDER_24H: "/scrims/scrim-1",
  REMINDER_1H: "/scrims/scrim-1",
  FEEDBACK_PROMPT: "/scrims/scrim-1",
  CHANNEL_BROKEN: "/team",
};

describe("buildMessage", () => {
  it.each(Object.values(NotifType))(
    "builds %s as an embed with a link button that pings nobody",
    (type) => {
      const body = buildMessage(sample(type), BASE_URL);
      expect(body.embeds).toHaveLength(1);
      expect(body.embeds![0]!.title).toBeTruthy();
      expect(body.allowed_mentions).toEqual({ parse: [] });
      expect(body.content).toBeUndefined();
      // 5 = link button: buttons only lead into the web app (SPEC P0-7).
      expect(linkOf(sample(type))).toMatchObject({ style: 5, url: `${BASE_URL}${LINKS[type]}` });
    },
  );

  it("escapes markdown and masked links in user text", () => {
    const message = sample(NotifType.APPLICATION_RECEIVED, {
      payload: { teamName: "**Bold** [x](https://evil.example)", startsAt: STARTS_AT },
    });
    expect(embedOf(message).description).toContain(
      "\\*\\*Bold\\*\\* \\[x\\](https://evil.example)",
    );
  });

  it.each([
    ["[ [Login](https://e.co)", "\\[ \\[Login\\](https://e.co)"],
    ["[a](https://x.co) [b](https://y.co)", "\\[a\\](https://x.co) \\[b\\](https://y.co)"],
    // A backslash of the user is escaped itself and cannot cancel the escaped bracket.
    ["\\[x](https://e.co)", "\\\\\\[x\\](https://e.co)"],
  ])("escapes every masked link in %j", (teamName, escaped) => {
    const message = sample(NotifType.APPLICATION_RECEIVED, {
      payload: { teamName, startsAt: STARTS_AT },
    });
    expect(embedOf(message).description).toContain(`**${escaped}**`);
  });

  it.each([
    ["<@&123> Team", "\\<@&123> Team"],
    ["<@456> <#789> <t:1>", "\\<@456> \\<#789> \\<t:1>"],
  ])("shows mentions in %j as text", (teamName, escaped) => {
    const message = sample(NotifType.SCRIM_CANCELLED, {
      payload: { ...scrimPayload, opponentTeamName: teamName },
    });
    expect(embedOf(message).description).toContain(`**${escaped}**`);
  });

  it("shows start, format and the opponent's captain with name and mention", () => {
    expect(embedOf(sample(NotifType.SCRIM_BOOKED)).fields).toEqual([
      { name: "Start", value: START_TEXT },
      { name: "Format", value: "BO3" },
      { name: "Gegnerischer Captain", value: "captain\\_b (<@222>)" },
    ]);
    const withoutAccount = sample(NotifType.REMINDER_1H, {
      opponentCaptain: { name: "Gelöschter Nutzer", discordId: null },
    });
    expect(embedOf(withoutAccount).fields).toContainEqual({
      name: "Gegnerischer Captain",
      value: "Gelöschter Nutzer",
    });
  });

  it("adds the feedback deadline to the feedback prompt", () => {
    expect(embedOf(sample(NotifType.FEEDBACK_PROMPT)).fields).toContainEqual({
      name: "Feedback bis",
      value: "So, 25.10.2026, 22:00 Uhr",
    });
  });

  it("shows the escaped reason of a rejected verification", () => {
    const message = sample(NotifType.VERIFICATION_RESULT, {
      payload: { approved: false, rejectReason: "Semester *abgelaufen*" },
    });
    expect(embedOf(message)).toMatchObject({
      title: "Verifizierung abgelehnt",
      fields: [{ name: "Grund", value: "Semester \\*abgelaufen\\*" }],
    });
  });

  it("names the original recipient of a redirected dev message", () => {
    const message = sample(NotifType.SCRIM_BOOKED, {
      recipient: { kind: "CHANNEL", channelId: "333", redirectedFrom: "Team *A*" },
    });
    expect(buildMessage(message, BASE_URL).content).toBe("[an: Team \\*A\\*]");
  });
});
