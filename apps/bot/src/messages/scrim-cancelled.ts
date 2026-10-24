import type { NotifType } from "@uni-scrims/db";
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
): MessageParts {
  return {
    title: "Scrim abgesagt",
    description: `Euer Scrim gegen ${team(message.payload.opponentTeamName, f)} wurde abgesagt.`,
    fields: scrimFields(message, f),
    link: scrimLink(message),
  };
}
