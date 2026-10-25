import { describeStart } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import {
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
  t: BotMessages,
): MessageParts {
  const fields = scrimFields(message, f, t);
  if (message.feedbackDeadline) {
    fields.push({
      name: t.fields.feedbackUntil,
      value: describeStart(message.feedbackDeadline, message.locale),
    });
  }
  return {
    title: t.feedbackPrompt.title,
    description: t.feedbackPrompt.description(team(message.payload.opponentTeamName, f)),
    fields,
    link: scrimLink(message, t.links.giveFeedback),
  };
}
