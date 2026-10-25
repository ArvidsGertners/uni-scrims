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

// Neutral wording: a cancellation after a ban must not reveal the ban (ARCHITECTURE §4).
export function scrimCancelled(
  message: MessageOf<typeof NotifType.SCRIM_CANCELLED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  return {
    title: t.scrimCancelled.title,
    description: t.scrimCancelled.description(team(message.payload.opponentTeamName, f)),
    fields: scrimFields(message, f, t),
    link: scrimLink(message, t.links.viewScrim),
  };
}
