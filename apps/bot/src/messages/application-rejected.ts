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

export function applicationRejected(
  message: MessageOf<typeof NotifType.APPLICATION_REJECTED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.applicationRejected.title,
    description: t.applicationRejected.description(team(message.payload.teamName, f)),
    fields: [startField(message.payload.startsAt, message.locale, t)],
    link: boardLink(t),
  };
}
