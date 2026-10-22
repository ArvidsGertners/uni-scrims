import type { NotifType } from "@uni-scrims/db";
import { type MessageOf, type MessageParts, plain, scrimFields, scrimLink } from "./common.ts";

// Neutral wording: a cancellation after a ban must not reveal the ban (ARCHITECTURE §4).
export function scrimCancelled(message: MessageOf<typeof NotifType.SCRIM_CANCELLED>): MessageParts {
  return {
    title: "Scrim abgesagt",
    description: `Euer Scrim gegen **${plain(message.payload.opponentTeamName)}** wurde abgesagt.`,
    fields: scrimFields(message),
    link: scrimLink(message),
  };
}
