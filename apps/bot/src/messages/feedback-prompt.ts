import { describeStart } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain, scrimFields, scrimLink } from "./common.ts";

export function feedbackPrompt(message: MessageOf<typeof NotifType.FEEDBACK_PROMPT>): MessageParts {
  const fields = scrimFields(message);
  if (message.feedbackDeadline) {
    fields.push({ name: "Feedback bis", value: describeStart(message.feedbackDeadline) });
  }
  return {
    title: "Wie lief euer Scrim?",
    description: `Gebt auf der Scrim-Seite an, ob der Scrim gegen **${plain(message.payload.opponentTeamName)}** stattgefunden hat. Pro Team zählt eine Antwort.`,
    fields,
    link: scrimLink(message, "Feedback geben"),
  };
}
