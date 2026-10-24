import type { NotifType } from "@uni-scrims/db";
import {
  BOARD_LINK,
  type MessageOf,
  type MessageParts,
  startField,
  team,
  type TextFormat,
} from "./common.ts";

export function requestExpired(
  message: MessageOf<typeof NotifType.REQUEST_EXPIRED>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Anfrage verfallen",
    description: `Die Anfrage von ${team(message.payload.teamName, f)} ist verfallen, ohne dass eine Bewerbung bestätigt wurde.`,
    fields: [startField(message.payload.startsAt)],
    link: BOARD_LINK,
  };
}
