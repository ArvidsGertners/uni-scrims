import type { NotifType } from "@uni-scrims/db";
import {
  BOARD_LINK,
  type MessageOf,
  type MessageParts,
  startField,
  team,
  type TextFormat,
} from "./common.ts";

export function applicationRejected(
  message: MessageOf<typeof NotifType.APPLICATION_REJECTED>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Bewerbung abgelehnt",
    description: `${team(message.payload.teamName, f)} hat ein anderes Team bestätigt.`,
    fields: [startField(message.payload.startsAt)],
    link: BOARD_LINK,
  };
}
