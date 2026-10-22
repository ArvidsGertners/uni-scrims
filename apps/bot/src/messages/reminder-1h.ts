import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain, scrimFields, scrimLink } from "./common.ts";

export function reminder1h(message: MessageOf<typeof NotifType.REMINDER_1H>): MessageParts {
  return {
    title: "Euer Scrim beginnt bald",
    description: `Gleich spielt ihr gegen **${plain(message.payload.opponentTeamName)}**.`,
    fields: scrimFields(message),
    link: scrimLink(message),
  };
}
