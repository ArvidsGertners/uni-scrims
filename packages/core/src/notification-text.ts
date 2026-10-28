// Title, text and link of a notification (ARCHITECTURE §6.1, §5.34), shared by the bot (embeds and
// mails add their fields) and the bell on the site. Request notes, application and thread messages
// are never part of it (SPEC P0-7, N-28).
import type { NotifType } from "@uni-scrims/db";
import type { Locale } from "../config/locale.ts";
import { NOTIFICATION_MESSAGES, type NotificationMessages } from "./i18n/notifications.ts";
import type { NotificationPayload } from "./notifications.ts";
import { formatBerlinDate, formatBerlinWeekday } from "./time.ts";

/** How names are written: bold and escaped on Discord, plain in mails and on the site. */
export type SummaryFormat = {
  /** The other team, from its raw name. */
  team: (name: string) => string;
  /** A command or similar. */
  code: (value: string) => string;
};

export const plainSummaryFormat: SummaryFormat = { team: (name) => name, code: (value) => value };

export type NotificationSummary = {
  title: string;
  description: string;
  /** A path into the web app. */
  link: { label: string; path: string };
};

export type SummaryContext = { requestId: string | null; scrimId: string | null; locale: Locale };

type Summarize<T extends NotifType> = (
  payload: NotificationPayload<T>,
  context: SummaryContext,
  f: SummaryFormat,
  t: NotificationMessages,
) => NotificationSummary;

const requestLink = (t: NotificationMessages, context: SummaryContext) => ({
  label: t.links.view,
  path: `/requests/${context.requestId}`,
});
const boardLink = (t: NotificationMessages) => ({ label: t.links.board, path: "/scrims" });
const requestsLink = (t: NotificationMessages) => ({
  label: t.links.requests,
  path: "/scrims?tab=anfragen",
});
const scrimLink = (label: string, context: SummaryContext) => ({
  label,
  path: `/scrims/${context.scrimId}`,
});

// A Record over all types, so a new type cannot be left without a text.
const summaries: { [T in NotifType]: Summarize<T> } = {
  VERIFICATION_RESULT: ({ approved }, _context, _f, t) =>
    approved
      ? {
          title: t.verificationApproved.title,
          description: t.verificationApproved.description,
          link: { label: t.links.viewStatus, path: "/verify" },
        }
      : {
          title: t.verificationRejected.title,
          description: t.verificationRejected.description,
          link: { label: t.links.uploadAgain, path: "/verify" },
        },
  APPLICATION_RECEIVED: (payload, context, f, t) => ({
    title: t.applicationReceived.title,
    description: t.applicationReceived.description(f.team(payload.teamName)),
    link: requestLink(t, context),
  }),
  APPLICATION_REJECTED: (payload, _context, f, t) => ({
    title: t.applicationRejected.title,
    description: t.applicationRejected.description(f.team(payload.teamName)),
    link: boardLink(t),
  }),
  REQUEST_DELETED: (payload, _context, f, t) =>
    // A direct request to the team, withdrawn by the requesting team (SPEC N-26).
    payload.direct
      ? {
          title: t.requestDeleted.directTitle,
          description: t.requestDeleted.directDescription(f.team(payload.teamName)),
          link: requestsLink(t),
        }
      : {
          title: t.requestDeleted.title,
          description: t.requestDeleted.description(f.team(payload.teamName)),
          link: boardLink(t),
        },
  REQUEST_EXPIRED: (payload, _context, f, t) => ({
    title: t.requestExpired.title,
    description: t.requestExpired.description(f.team(payload.teamName)),
    link: boardLink(t),
  }),
  SCRIM_BOOKED: (payload, context, f, t) => ({
    title: t.scrimBooked.title,
    description: t.scrimBooked.description(f.team(payload.opponentTeamName)),
    link: scrimLink(t.links.viewScrim, context),
  }),
  SCRIM_CANCELLED: (payload, context, f, t) => ({
    title: t.scrimCancelled.title,
    description: t.scrimCancelled.description(f.team(payload.opponentTeamName)),
    link: scrimLink(t.links.viewScrim, context),
  }),
  REMINDER_24H: (payload, context, f, t) => ({
    title: t.reminder24h.title,
    description: t.reminder24h.description(f.team(payload.opponentTeamName)),
    link: scrimLink(t.links.viewScrim, context),
  }),
  REMINDER_1H: (payload, context, f, t) => ({
    title: t.reminder1h.title,
    description: t.reminder1h.description(f.team(payload.opponentTeamName)),
    link: scrimLink(t.links.viewScrim, context),
  }),
  FEEDBACK_PROMPT: (payload, context, f, t) => ({
    title: t.feedbackPrompt.title,
    description: t.feedbackPrompt.description(f.team(payload.opponentTeamName)),
    link: scrimLink(t.links.giveFeedback, context),
  }),
  CHANNEL_BROKEN: (payload, _context, f, t) => ({
    title: t.channelBroken.title,
    description: t.channelBroken.description(f.team(payload.teamName), f.code("/setup")),
    link: { label: t.links.team, path: "/team" },
  }),
  DIRECT_REQUEST_RECEIVED: (payload, context, f, t) => {
    const from = f.team(payload.teamName);
    return {
      title: t.directRequestReceived.title,
      description: payload.readyWindow
        ? t.directRequestReceived.readyWindowDescription(from)
        : payload.weeklyUntil
          ? t.directRequestReceived.weeklyDescription(
              from,
              formatBerlinDate(new Date(payload.weeklyUntil), context.locale),
            )
          : t.directRequestReceived.description(from),
      link: requestLink(t, context),
    };
  },
  DIRECT_REQUEST_DECLINED: (payload, context, f, t) => {
    const from = f.team(payload.teamName);
    // Declined with the end of a window "Heute spielbereit" (SPEC N-27).
    const reason = payload.readyWindow;
    return {
      title: t.directRequestDeclined.title,
      description:
        reason === "BOOKED"
          ? t.directRequestDeclined.readyWindowBooked(from)
          : reason === "ENDED"
            ? t.directRequestDeclined.readyWindowEnded(from)
            : t.directRequestDeclined.description(from),
      link: requestLink(t, context),
    };
  },
  PARTNERSHIP_ENDED: (payload, context, f, t) => ({
    title: t.partnershipEnded.title,
    description: t.partnershipEnded.description(
      f.team(payload.teamName),
      formatBerlinWeekday(new Date(payload.startsAt), context.locale),
    ),
    link: requestsLink(t),
  }),
  MESSAGE_RECEIVED: (payload, context, f, t) => {
    const from = f.team(payload.teamName);
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
      // chat opens the chat sidebar with the right thread (the host of a board request has one per
      // application), on phones too.
      link: {
        label: t.links.readMessage,
        path:
          payload.context === "SCRIM" && context.scrimId
            ? `/scrims/${context.scrimId}?chat=${payload.guestTeamId}`
            : `/requests/${context.requestId}?chat=${payload.guestTeamId}`,
      },
    };
  },
};

/** Title, text and link of a notification in the context's language. */
export function notificationSummary<T extends NotifType>(
  type: T,
  payload: NotificationPayload<T>,
  context: SummaryContext,
  f: SummaryFormat,
): NotificationSummary {
  // The summary is picked by type, so it matches the payload.
  const summarize = summaries[type] as Summarize<T>;
  return summarize(payload, context, f, NOTIFICATION_MESSAGES[context.locale]);
}
