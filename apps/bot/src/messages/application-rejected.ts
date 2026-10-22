import type { NotifType } from "@uni-scrims/db";
import { BOARD_LINK, type MessageOf, type MessageParts, plain, startField } from "./common.ts";

export function applicationRejected(
  message: MessageOf<typeof NotifType.APPLICATION_REJECTED>,
): MessageParts {
  return {
    title: "Bewerbung abgelehnt",
    description: `**${plain(message.payload.teamName)}** hat ein anderes Team bestätigt.`,
    fields: [startField(message.payload.startsAt)],
    link: BOARD_LINK,
  };
}
