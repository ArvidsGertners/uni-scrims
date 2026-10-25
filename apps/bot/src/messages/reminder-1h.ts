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

export function reminder1h(
  message: MessageOf<typeof NotifType.REMINDER_1H>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.reminder1h.title,
    description: t.reminder1h.description(team(message.payload.opponentTeamName, f)),
    fields: scrimFields(message, f, t),
    link: scrimLink(message, t.links.viewScrim),
  };
}
