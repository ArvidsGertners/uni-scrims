import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import {
  boardLink,
  type MessageOf,
  type MessageParts,
  startField,
  team,
  type TextFormat,
} from "./common.ts";

export function requestExpired(
  message: MessageOf<typeof NotifType.REQUEST_EXPIRED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.requestExpired.title,
    description: t.requestExpired.description(team(message.payload.teamName, f)),
    fields: [startField(message.payload.startsAt, message.locale)],
    link: boardLink(t),
  };
}
