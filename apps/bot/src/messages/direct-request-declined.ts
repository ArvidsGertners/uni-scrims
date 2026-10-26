import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, startField, team, type TextFormat } from "./common.ts";

export function directRequestDeclined(
  message: MessageOf<typeof NotifType.DIRECT_REQUEST_DECLINED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.directRequestDeclined.title,
    description: t.directRequestDeclined.description(team(message.payload.teamName, f)),
    fields: [startField(message.payload.startsAt, message.locale)],
    link: { label: t.links.view, path: `/requests/${message.requestId}` },
  };
}
