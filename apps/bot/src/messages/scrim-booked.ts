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

export function scrimBooked(
  message: MessageOf<typeof NotifType.SCRIM_BOOKED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.scrimBooked.title,
    description: t.scrimBooked.description(team(message.payload.opponentTeamName, f)),
    fields: scrimFields(message, f, t),
    link: scrimLink(message, t.links.viewScrim),
  };
}
