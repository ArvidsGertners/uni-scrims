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
  const from = team(message.payload.teamName, f);
  // A direct request to the team, withdrawn by the requesting team (SPEC N-26).
  if (message.payload.direct) {
    return {
      title: t.requestDeleted.directTitle,
      description: t.requestDeleted.directDescription(from),
      fields: [startField(message.payload.startsAt, message.locale)],
      link: { label: t.links.requests, path: "/scrims?tab=anfragen" },
    };
  }
  return {
    title: t.requestDeleted.title,
    description: t.requestDeleted.description(from),
    fields: [startField(message.payload.startsAt, message.locale)],
    link: boardLink(t),
  };
}
