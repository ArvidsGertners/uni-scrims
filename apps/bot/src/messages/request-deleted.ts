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

export function requestDeleted(
  message: MessageOf<typeof NotifType.REQUEST_DELETED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.requestDeleted.title,
    description: t.requestDeleted.description(team(message.payload.teamName, f)),
    fields: [startField(message.payload.startsAt, message.locale)],
    link: boardLink(t),
  };
}
