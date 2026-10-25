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

// No relative time in the text: a caught-up reminder may arrive later than planned.
export function reminder24h(
  message: MessageOf<typeof NotifType.REMINDER_24H>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.reminder24h.title,
    description: t.reminder24h.description(team(message.payload.opponentTeamName, f)),
    fields: scrimFields(message, f, t),
    link: scrimLink(message, t.links.viewScrim),
  };
}
