import type { NotifType } from "@uni-scrims/db";
import type { BotMessages } from "../i18n/messages.ts";
import { type MessageOf, type MessageParts, startField, team, type TextFormat } from "./common.ts";

/** A new message between teams, without its text (SPEC N-28, §5.30). */
export function messageReceived(
  message: MessageOf<typeof NotifType.MESSAGE_RECEIVED>,
  f: TextFormat,
  t: BotMessages,
): MessageParts {
  const { payload, locale } = message;
  const from = team(payload.teamName, f);
  const texts = t.messageReceived;
  const about =
    payload.context === "SCRIM"
      ? texts.scrim(from)
      : payload.context === "DIRECT"
        ? payload.toGuest
          ? texts.directToGuest(from)
          : texts.directToHost(from)
        : payload.toGuest
          ? texts.applicationToGuest(from)
          : texts.applicationToHost(from);
  return {
    title: texts.title,
    description: `${about} ${texts.onlyOnSite}`,
    fields: [startField(payload.startsAt, locale)],
    // chat opens the chat sidebar with the right thread (the host of a board request has one per
    // application), on phones too.
    link: {
      label: t.links.readMessage,
      path:
        payload.context === "SCRIM" && message.scrimId
          ? `/scrims/${message.scrimId}?chat=${payload.guestTeamId}`
          : `/requests/${message.requestId}?chat=${payload.guestTeamId}`,
    },
  };
}
