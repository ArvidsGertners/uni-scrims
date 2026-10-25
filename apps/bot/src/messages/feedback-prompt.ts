import { describeStart } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import {
  MESSAGE_LOCALE,
  type MessageOf,
  type MessageParts,
  scrimFields,
  scrimLink,
  team,
  type TextFormat,
} from "./common.ts";

export function feedbackPrompt(
  message: MessageOf<typeof NotifType.FEEDBACK_PROMPT>,
  f: TextFormat,
): MessageParts {
  const fields = scrimFields(message, f);
  if (message.feedbackDeadline) {
    fields.push({
      name: "Feedback bis",
      value: describeStart(message.feedbackDeadline, MESSAGE_LOCALE),
    });
  }
  return {
    title: "Wie lief euer Scrim?",
    description: `Gebt auf der Scrim-Seite an, ob der Scrim gegen ${team(message.payload.opponentTeamName, f)} stattgefunden hat. Pro Team zählt eine Antwort.`,
    fields,
    link: scrimLink(message, "Feedback geben"),
  };
}
