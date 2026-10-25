// Notification mails (ARCHITECTURE §5.17): the text of the Discord message as plain text.
import type { OutboxMessage } from "@uni-scrims/core";
import { NotifType } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import { buildMessage } from "../src/messages/index.ts";
import { buildMail } from "../src/messages/mail.ts";

const BASE_URL = "https://scrims.example";
const STARTS_AT = "2026-10-22T18:00:00.000Z";
const scrimPayload = { opponentTeamName: "Die *Bären*", startsAt: STARTS_AT, format: "BO3" };
const requestPayload = { teamName: "Die *Bären*", startsAt: STARTS_AT };
const payloads: Record<NotifType, unknown> = {
  VERIFICATION_RESULT: { approved: false, rejectReason: "Name fehlt" },
  APPLICATION_RECEIVED: requestPayload,
  APPLICATION_REJECTED: requestPayload,
  REQUEST_DELETED: requestPayload,
  REQUEST_EXPIRED: requestPayload,
  SCRIM_BOOKED: scrimPayload,
  SCRIM_CANCELLED: scrimPayload,
  REMINDER_24H: scrimPayload,
  REMINDER_1H: scrimPayload,
  FEEDBACK_PROMPT: scrimPayload,
  CHANNEL_BROKEN: { teamName: "Die *Bären*" },
};

function sample(type: NotifType): OutboxMessage {
  return {
    id: "notification-1",
    type,
    payload: payloads[type],
    recipient: { kind: "EMAIL", userId: "user-1", email: "ana@example.org", redirectedFrom: null },
    requestId: "request-1",
    scrimId: "scrim-1",
    opponentCaptain: { name: "captain_b", discordId: "222" },
    feedbackDeadline: new Date("2026-10-25T21:00:00.000Z"),
    locale: "de",
  } as OutboxMessage;
}

describe("buildMail", () => {
  it.each(Object.values(NotifType))(
    "writes %s as plain text with the link and where to switch it off",
    (type) => {
      const message = sample(type);
      const mail = buildMail(message, "ana@example.org", BASE_URL);
      const embed = buildMessage(message, BASE_URL).embeds![0]!;
      expect(mail.to).toBe("ana@example.org");
      expect(mail.subject).toBe(embed.title);
      expect(mail.text).toMatch(/^Hallo,\n\n/);
      expect(mail.text).toContain(`: ${BASE_URL}/`);
      expect(mail.text).toContain(`${BASE_URL}/account/notifications`);
      expect(mail.text).toMatch(/Uni Scrims$/);
      // No Discord markdown, escaping or mentions in a mail.
      expect(mail.text).not.toMatch(/\*\*|\\|<@/);
    },
  );

  it("keeps user text as it is and names the opponent's captain without a mention", () => {
    const mail = buildMail(sample(NotifType.SCRIM_BOOKED), "ana@example.org", BASE_URL);
    expect(mail.text).toContain("Euer Scrim gegen Die *Bären* steht.");
    expect(mail.text).toContain("Gegnerischer Captain: captain_b\n");
    expect(mail.text).toContain("Scrim ansehen: https://scrims.example/scrims/scrim-1");
    expect(mail.text).toContain("weil „Scrim gebucht“ in deinen Einstellungen per E-Mail");
  });

  it("puts the reason of a rejection in the text", () => {
    const mail = buildMail(sample(NotifType.VERIFICATION_RESULT), "ana@example.org", BASE_URL);
    expect(mail.subject).toBe("Verifizierung abgelehnt");
    expect(mail.text).toContain("Grund: Name fehlt");
  });

  it("writes the mail in the recipient's language (§5.22)", () => {
    const mail = buildMail(
      { ...sample(NotifType.SCRIM_BOOKED), locale: "en" } as OutboxMessage,
      "ana@example.org",
      BASE_URL,
    );
    expect(mail.subject).toBe("Scrim booked");
    expect(mail.text).toMatch(/^Hi,\n\n/);
    expect(mail.text).toContain("Opposing captain: captain_b\n");
    expect(mail.text).toContain("View scrim: https://scrims.example/scrims/scrim-1");
    expect(mail.text).toContain(
      "because “Scrim booked” is switched on for email in your settings. You can change that here: https://scrims.example/account/notifications",
    );
  });
});
