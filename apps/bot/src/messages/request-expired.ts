import type { NotifType } from "@uni-scrims/db";
import { BOARD_LINK, type MessageOf, type MessageParts, plain, startField } from "./common.ts";

export function requestExpired(message: MessageOf<typeof NotifType.REQUEST_EXPIRED>): MessageParts {
  return {
    title: "Anfrage verfallen",
    description: `Die Anfrage von **${plain(message.payload.teamName)}** ist verfallen, ohne dass eine Bewerbung bestätigt wurde.`,
    fields: [startField(message.payload.startsAt)],
    link: BOARD_LINK,
  };
}
