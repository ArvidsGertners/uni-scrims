import type { NotifType } from "@uni-scrims/db";
import {
  type MessageOf,
  type MessageParts,
  scrimFields,
  scrimLink,
  team,
  type TextFormat,
} from "./common.ts";

// No relative time in the text: a caught-up reminder may arrive later than planned.
export function reminder24h(
  message: MessageOf<typeof NotifType.REMINDER_24H>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Erinnerung an euren Scrim",
    description: `Euer Scrim gegen ${team(message.payload.opponentTeamName, f)} steht an.`,
    fields: scrimFields(message, f),
    link: scrimLink(message),
  };
}
