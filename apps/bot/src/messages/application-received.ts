import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, startField, team, type TextFormat } from "./common.ts";

export function applicationReceived(
  message: MessageOf<typeof NotifType.APPLICATION_RECEIVED>,
  f: TextFormat,
): MessageParts {
  return {
    title: "Neue Bewerbung",
    description: `${team(message.payload.teamName, f)} hat sich auf eure Anfrage beworben.`,
    fields: [startField(message.payload.startsAt)],
    link: { label: "Ansehen", path: `/requests/${message.requestId}` },
  };
}
