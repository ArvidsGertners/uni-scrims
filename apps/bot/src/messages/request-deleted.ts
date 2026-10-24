import type { NotifType } from "@uni-scrims/db";
import {
  BOARD_LINK,
  type MessageOf,
  type MessageParts,
  startField,
  team,
  type TextFormat,
} from "./common.ts";

export function requestDeleted(
  message: MessageOf<typeof NotifType.REQUEST_DELETED>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Anfrage gelöscht",
    description: `Die Anfrage von ${team(message.payload.teamName, f)}, auf die ihr euch beworben habt, wurde gelöscht.`,
    fields: [startField(message.payload.startsAt)],
    link: BOARD_LINK,
  };
}
