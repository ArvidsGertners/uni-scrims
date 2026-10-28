import type { OutboxMessage } from "@uni-scrims/core";
import { NotifType } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import { type MessageOf, linkUrl } from "../src/messages/common.ts";
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
  DIRECT_REQUEST_RECEIVED: { ...requestPayload, format: "BO3", weeklyUntil: null },
  DIRECT_REQUEST_DECLINED: requestPayload,
  PARTNERSHIP_ENDED: requestPayload,
  MESSAGE_RECEIVED: { ...requestPayload, context: "SCRIM", guestTeamId: "team-2", toGuest: true },
  STAFF_VERIFICATION_PENDING: { verificationId: "verification-1" },
  STAFF_MESSAGE_REPORTED: { messageId: "message-1" },
  STAFF_TEAM_LIMIT_REQUEST: { teamLimitRequestId: "limit-1" },
  STAFF_DISPUTE: { hostTeamName: "Die Bären", guestTeamName: "Team Wolf", startsAt: STARTS_AT },
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
    locale: "de",
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
  DIRECT_REQUEST_RECEIVED: "/requests/request-1",
  DIRECT_REQUEST_DECLINED: "/requests/request-1",
  PARTNERSHIP_ENDED: "/scrims?tab=anfragen",
  MESSAGE_RECEIVED: "/scrims/scrim-1?chat=team-2",
  // Into the admin area, without ADMIN_URL under /admin (Phase 37, §5.35).
  STAFF_VERIFICATION_PENDING: "/admin/queue",
  STAFF_MESSAGE_REPORTED: "/admin/reports",
  STAFF_TEAM_LIMIT_REQUEST: "/admin/team-limits",
  STAFF_DISPUTE: "/admin/disputes",
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

  it("links staff notifications to ADMIN_URL if set (§5.35)", () => {
    const link = { label: "Zur Prüf-Queue", path: "/queue", host: "admin" as const };
    expect(linkUrl(link, BASE_URL, { ADMIN_URL: "https://admin.scrims.example" })).toBe(
      "https://admin.scrims.example/queue",
    );
    expect(linkUrl(link, BASE_URL, {})).toBe(`${BASE_URL}/admin/queue`);
    expect(linkUrl({ label: "x", path: "/team" }, BASE_URL, { ADMIN_URL: "https://a.x" })).toBe(
      `${BASE_URL}/team`,
    );
  });

  it("tells staff about a case without names of people (SPEC N-33)", () => {
    expect(embedOf(sample(NotifType.STAFF_VERIFICATION_PENDING))).toMatchObject({
      title: "Neue Verifizierung",
      description: "Eine Studienbescheinigung wartet in der Prüf-Queue auf ihre Prüfung.",
    });
    expect(embedOf(sample(NotifType.STAFF_DISPUTE))).toMatchObject({
      title: "Strittiges Scrim",
      description:
        "Die Feedbacks von **Die Bären** und **Team Wolf** zum Scrim am 22.10.2026 widersprechen sich. Der Streitfall wartet auf eine Entscheidung.",
      fields: [{ name: "Start", value: START_TEXT }],
    });
    expect(linkOf(sample(NotifType.STAFF_MESSAGE_REPORTED)).label).toBe("Zu den Meldungen");
  });

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

/** German in an English message: umlauts, ß, the German opening quote or common German words. */
const GERMAN =
  /[äöüÄÖÜß„]|\b(und|der|die|das|nicht|mit|für|euer|eure|ihr|Uhr|Gegnerischer|ansehen|Zum)\b/;

describe("direct requests and fixed partners (SPEC N-26)", () => {
  it("names a proposed partnership and its end date", () => {
    const weekly = sample(NotifType.DIRECT_REQUEST_RECEIVED, {
      payload: { ...requestPayload, format: "BO3", weeklyUntil: "2026-11-19T19:00:00.000Z" },
    });
    expect(embedOf(weekly)).toMatchObject({
      title: "Neue Direktanfrage",
      fields: [
        { name: "Start", value: START_TEXT },
        { name: "Format", value: "BO3" },
      ],
    });
    expect(embedOf(weekly).description).toContain("jede Woche zur selben Zeit bis 19.11.2026");
    expect(embedOf(sample(NotifType.DIRECT_REQUEST_RECEIVED)).description).not.toContain(
      "jede Woche",
    );
  });

  it("tells the requested team about a withdrawn direct request", () => {
    const withdrawn = sample(NotifType.REQUEST_DELETED, {
      payload: { ...requestPayload, direct: true },
    });
    expect(embedOf(withdrawn)).toMatchObject({
      title: "Direktanfrage zurückgezogen",
      description: "**Die Bären** hat die Direktanfrage an euch zurückgezogen.",
    });
    expect(linkOf(withdrawn)).toMatchObject({ url: `${BASE_URL}/scrims?tab=anfragen` });
  });

  it("names the weekday of an ended partnership", () => {
    expect(embedOf(sample(NotifType.PARTNERSHIP_ENDED)).description).toContain(
      "(jeden Donnerstag)",
    );
  });

  it("tells about requests for a window Heute spielbereit (SPEC N-27)", () => {
    const received = sample(NotifType.DIRECT_REQUEST_RECEIVED, {
      payload: { ...requestPayload, format: "BO3", weeklyUntil: null, readyWindow: true },
    });
    expect(embedOf(received)).toMatchObject({
      title: "Neue Direktanfrage",
      description:
        "**Die Bären** fragt euch für euer Zeitfenster „Heute spielbereit“ an. Nehmt die Anfrage auf der Seite an oder lehnt sie ab; mit einer Zusage endet euer Zeitfenster.",
    });
    const declined = (readyWindow: "BOOKED" | "ENDED") =>
      embedOf(
        sample(NotifType.DIRECT_REQUEST_DECLINED, { payload: { ...requestPayload, readyWindow } }),
      ).description;
    expect(declined("BOOKED")).toBe(
      "**Die Bären** hat für heute schon einen Gegner. Eure Anfrage für ihr Zeitfenster ist damit abgelehnt.",
    );
    expect(declined("ENDED")).toBe(
      "**Die Bären** ist heute doch nicht mehr spielbereit. Eure Anfrage für ihr Zeitfenster ist damit abgelehnt.",
    );
    expect(embedOf(sample(NotifType.DIRECT_REQUEST_DECLINED)).description).toBe(
      "**Die Bären** hat eure Direktanfrage abgelehnt.",
    );
  });
});

describe("messages between teams (SPEC N-28)", () => {
  const received = (
    context: "APPLICATION" | "DIRECT" | "SCRIM",
    toGuest: boolean,
    locale: "de" | "en" = "de",
  ) =>
    sample(NotifType.MESSAGE_RECEIVED, {
      payload: { ...requestPayload, context, guestTeamId: "team-2", toGuest },
      locale,
      ...(context === "SCRIM" ? {} : { scrimId: null }),
    });

  it("names who wrote and about what, from the receiving side, never the text", () => {
    const only = " Die Nachricht selbst steht nur auf der Seite.";
    expect(embedOf(received("APPLICATION", false))).toMatchObject({
      title: "Neue Nachricht",
      description: `**Die Bären** hat euch zu seiner Bewerbung auf eure Anfrage geschrieben.${only}`,
      fields: [{ name: "Start", value: START_TEXT }],
    });
    expect(embedOf(received("APPLICATION", true)).description).toBe(
      `**Die Bären** hat euch zu eurer Bewerbung geschrieben.${only}`,
    );
    expect(embedOf(received("DIRECT", false)).description).toBe(
      `**Die Bären** hat euch zu eurer Direktanfrage geschrieben.${only}`,
    );
    expect(embedOf(received("DIRECT", true)).description).toBe(
      `**Die Bären** hat euch zu seiner Direktanfrage an euch geschrieben.${only}`,
    );
    expect(embedOf(received("SCRIM", true)).description).toBe(
      `**Die Bären** hat euch zu eurem Scrim geschrieben.${only}`,
    );
  });

  it("links the scrim or the request, with the thread of the guest team", () => {
    // ?chat= opens the chat sidebar on phones.
    expect(linkOf(received("SCRIM", false))).toMatchObject({
      label: "Nachricht lesen",
      url: `${BASE_URL}/scrims/scrim-1?chat=team-2`,
    });
    expect(linkOf(received("APPLICATION", false)).url).toBe(
      `${BASE_URL}/requests/request-1?chat=team-2`,
    );
    expect(linkOf(received("DIRECT", true)).url).toBe(`${BASE_URL}/requests/request-1?chat=team-2`);
  });

  it("writes them in English", () => {
    expect(embedOf(received("APPLICATION", false, "en"))).toMatchObject({
      title: "New message",
      description:
        "**Die Bären** sent you a message about its application to your request. The message itself is only on the site.",
    });
    expect(embedOf(received("DIRECT", true, "en")).description).toBe(
      "**Die Bären** sent you a message about its direct request to you. The message itself is only on the site.",
    );
    expect(linkOf(received("SCRIM", true, "en")).label).toBe("Read message");
  });
});

describe("buildMessage in English (§5.22)", () => {
  const english = <T extends NotifType>(
    type: T,
    overrides: Partial<Omit<MessageOf<T>, "type">> = {},
  ) => sample(type, { locale: "en", ...overrides } as Partial<Omit<MessageOf<T>, "type">>);

  it.each(Object.values(NotifType))("writes %s in English", (type) => {
    // A team name without German words, so only the message text is checked.
    const message = english(type);
    const body = buildMessage(
      {
        ...message,
        payload: JSON.parse(JSON.stringify(message.payload).replaceAll("Die Bären", "Team A")),
      } as OutboxMessage,
      BASE_URL,
    );
    const embed = body.embeds![0]!;
    const row = body.components![0] as { components: { label: string }[] };
    const button = row.components[0]!;
    const texts = [
      embed.title,
      embed.description,
      button.label,
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ];
    for (const text of texts) expect(text, `${type}: ${text}`).not.toMatch(GERMAN);
  });

  it("writes the variants for a window Ready today in English", () => {
    const texts = [
      embedOf(
        english(NotifType.DIRECT_REQUEST_RECEIVED, {
          payload: {
            teamName: "Team A",
            startsAt: STARTS_AT,
            format: "BO3",
            weeklyUntil: null,
            readyWindow: true,
          },
        }),
      ).description,
      ...(["BOOKED", "ENDED"] as const).map(
        (readyWindow) =>
          embedOf(
            english(NotifType.DIRECT_REQUEST_DECLINED, {
              payload: { teamName: "Team A", startsAt: STARTS_AT, readyWindow },
            }),
          ).description,
      ),
    ];
    expect(texts).toEqual([
      "**Team A** is asking you for your “Ready today” window. Accept or decline the request on the site; accepting one ends your window.",
      "**Team A** already has an opponent for today, so your request for their window is declined.",
      "**Team A** is no longer ready to play today, so your request for their window is declined.",
    ]);
  });

  it("shows start, format and the opponent's captain in English", () => {
    expect(embedOf(english(NotifType.SCRIM_BOOKED)).fields).toEqual([
      { name: "Start", value: "Thu 22 Oct 2026, 20:00" },
      { name: "Format", value: "BO3" },
      { name: "Opposing captain", value: "captain\\_b (<@222>)" },
    ]);
    const deleted = english(NotifType.REMINDER_1H, {
      opponentCaptain: { name: "Gelöschter Nutzer", discordId: null },
    });
    expect(embedOf(deleted).fields).toContainEqual({
      name: "Opposing captain",
      value: "Deleted user",
    });
  });

  it("translates the fixed rejection reasons of core, not a reviewer's own text", () => {
    const fixed = english(NotifType.VERIFICATION_RESULT, {
      payload: { approved: false, rejectReason: "Prüfung nicht rechtzeitig erfolgt" },
    });
    expect(embedOf(fixed)).toMatchObject({
      title: "Verification rejected",
      fields: [{ name: "Reason", value: "Not reviewed in time" }],
    });
    const own = english(NotifType.VERIFICATION_RESULT, {
      payload: { approved: false, rejectReason: "Name passt nicht" },
    });
    expect(embedOf(own).fields).toEqual([{ name: "Reason", value: "Name passt nicht" }]);
  });
});
