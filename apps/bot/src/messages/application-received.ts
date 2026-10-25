import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, startField, team, type TextFormat } from "./common.ts";

export function applicationReceived(
  message: MessageOf<typeof NotifType.APPLICATION_RECEIVED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.applicationReceived.title,
    description: t.applicationReceived.description(team(message.payload.teamName, f)),
    fields: [startField(message.payload.startsAt, message.locale, t)],
    link: { label: t.links.view, path: `/requests/${message.requestId}` },
  };
}
