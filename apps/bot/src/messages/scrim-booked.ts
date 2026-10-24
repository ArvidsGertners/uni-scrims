import type { NotifType } from "@uni-scrims/db";
import {
  type MessageOf,
  type MessageParts,
  scrimFields,
  scrimLink,
  team,
  type TextFormat,
} from "./common.ts";

export function scrimBooked(
  message: MessageOf<typeof NotifType.SCRIM_BOOKED>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Scrim gebucht",
    description: `Euer Scrim gegen ${team(message.payload.opponentTeamName, f)} steht. Sprecht die Lobby mit dem gegnerischen Captain ab.`,
    fields: scrimFields(message, f),
    link: scrimLink(message),
  };
}
