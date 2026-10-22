import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain, startField } from "./common.ts";

export function applicationReceived(
  message: MessageOf<typeof NotifType.APPLICATION_RECEIVED>,
): MessageParts {
  return {
    title: "Neue Bewerbung",
    description: `**${plain(message.payload.teamName)}** hat sich auf eure Anfrage beworben.`,
    fields: [startField(message.payload.startsAt)],
    link: { label: "Ansehen", path: `/requests/${message.requestId}` },
  };
}
