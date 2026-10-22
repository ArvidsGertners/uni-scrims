import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain, scrimFields, scrimLink } from "./common.ts";

// No relative time in the text: a caught-up reminder may arrive later than planned.
export function reminder24h(message: MessageOf<typeof NotifType.REMINDER_24H>): MessageParts {
  return {
    title: "Erinnerung an euren Scrim",
    description: `Euer Scrim gegen **${plain(message.payload.opponentTeamName)}** steht an.`,
    fields: scrimFields(message),
    link: scrimLink(message),
  };
}
