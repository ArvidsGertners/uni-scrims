import { formatBerlinWeekday } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, team, type TextFormat } from "./common.ts";

export function partnershipEnded(
  message: MessageOf<typeof NotifType.PARTNERSHIP_ENDED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  const weekday = formatBerlinWeekday(new Date(message.payload.startsAt), message.locale);
  return {
    title: t.partnershipEnded.title,
    description: t.partnershipEnded.description(team(message.payload.teamName, f), weekday),
    link: { label: t.links.requests, path: "/scrims?tab=anfragen" },
  };
}
