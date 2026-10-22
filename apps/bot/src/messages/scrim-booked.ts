import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain, scrimFields, scrimLink } from "./common.ts";

export function scrimBooked(message: MessageOf<typeof NotifType.SCRIM_BOOKED>): MessageParts {
  return {
    title: "Scrim gebucht",
    description: `Euer Scrim gegen **${plain(message.payload.opponentTeamName)}** steht. Sprecht die Lobby mit dem gegnerischen Captain ab.`,
    fields: scrimFields(message),
    link: scrimLink(message),
  };
}
