import type { NotifType } from "@uni-scrims/db";
import {
  type MessageOf,
  type MessageParts,
  scrimFields,
  scrimLink,
  team,
  type TextFormat,
} from "./common.ts";

export function reminder1h(
  message: MessageOf<typeof NotifType.REMINDER_1H>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Euer Scrim beginnt bald",
    description: `Gleich spielt ihr gegen ${team(message.payload.opponentTeamName, f)}.`,
    fields: scrimFields(message, f),
    link: scrimLink(message),
  };
}
