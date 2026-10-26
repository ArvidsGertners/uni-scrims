import { SCRIM_FORMAT_LABELS, formatBerlinDate } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, startField, team, type TextFormat } from "./common.ts";

export function directRequestReceived(
  message: MessageOf<typeof NotifType.DIRECT_REQUEST_RECEIVED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  const { payload, locale } = message;
  const from = team(payload.teamName, f);
  return {
    title: t.directRequestReceived.title,
    description: payload.weeklyUntil
      ? t.directRequestReceived.weeklyDescription(
          from,
          formatBerlinDate(new Date(payload.weeklyUntil), locale),
        )
      : t.directRequestReceived.description(from),
    fields: [
      startField(payload.startsAt, locale),
      { name: t.fields.format, value: SCRIM_FORMAT_LABELS[locale][payload.format] },
    ],
    link: { label: t.links.view, path: `/requests/${message.requestId}` },
  };
}
