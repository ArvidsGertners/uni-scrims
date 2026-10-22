import type { NotifType } from "@uni-scrims/db";
import { BOARD_LINK, type MessageOf, type MessageParts, plain, startField } from "./common.ts";

export function requestDeleted(message: MessageOf<typeof NotifType.REQUEST_DELETED>): MessageParts {
  return {
    title: "Anfrage gelöscht",
    description: `Die Anfrage von **${plain(message.payload.teamName)}**, auf die ihr euch beworben habt, wurde gelöscht.`,
    fields: [startField(message.payload.startsAt)],
    link: BOARD_LINK,
  };
}
