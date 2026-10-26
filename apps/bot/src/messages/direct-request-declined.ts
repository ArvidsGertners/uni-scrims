import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, startField, team, type TextFormat } from "./common.ts";

export function directRequestDeclined(
  message: MessageOf<typeof NotifType.DIRECT_REQUEST_DECLINED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  const from = team(message.payload.teamName, f);
  // Declined with the end of a window "Heute spielbereit" (SPEC N-27).
  const reason = message.payload.readyWindow;
  return {
    title: t.directRequestDeclined.title,
    description:
      reason === "BOOKED"
        ? t.directRequestDeclined.readyWindowBooked(from)
        : reason === "ENDED"
          ? t.directRequestDeclined.readyWindowEnded(from)
          : t.directRequestDeclined.description(from),
    fields: [startField(message.payload.startsAt, message.locale)],
    link: { label: t.links.view, path: `/requests/${message.requestId}` },
  };
}
