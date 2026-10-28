import {
  type FeedbackOutcome,
  type Locale,
  type LogoBackground,
  MemberRole,
  type NotifChannel,
  type NotifStatus,
  type NotifType,
  type RequestStatus,
  type ScrimFormat,
  type ScrimStatus,
  type StaffRole,
  type TeamLimitStatus,
  type ThemePreference,
  type VerifStatus,
} from "@uni-scrims/db";
import { type Localized, dictionary } from "../../config/locale.ts";

// Display names of enum values in both languages (§5.21). The data export uses `.de`; ranks have
// English names in both languages (ranks.ts).

/** Display names of Team.game; only Valorant for now (SPEC P2), unknown values show as stored. */
export const GAME_LABELS: Record<string, string> = {
  valorant: "Valorant",
};

/** Roles of team members in the order the team page offers them (SPEC N-1). */
export const MEMBER_ROLES: readonly MemberRole[] = [
  MemberRole.PLAYER,
  MemberRole.SUBSTITUTE,
  MemberRole.COACH,
];

/** Display names of the formats (SPEC P0-4). */
export const SCRIM_FORMAT_LABELS: Localized<Record<ScrimFormat, string>> = dictionary(
  { ONE_MAP: "1 Map", TWO_MAPS: "2 Maps", BO3: "BO3" },
  { ONE_MAP: "1 map", TWO_MAPS: "2 maps", BO3: "BO3" },
);

export const MEMBER_ROLE_LABELS: Localized<Record<MemberRole, string>> = dictionary(
  { PLAYER: "Spieler", SUBSTITUTE: "Ersatzspieler", COACH: "Coach" },
  { PLAYER: "Player", SUBSTITUTE: "Substitute", COACH: "Coach" },
);

/** Staff roles (SPEC N-4). */
export const STAFF_ROLE_LABELS: Localized<Record<StaffRole, string>> = dictionary(
  { OPERATOR: "Betreiber", ADMIN: "Admin", REVIEWER: "Prüfer" },
  { OPERATOR: "Operator", ADMIN: "Admin", REVIEWER: "Reviewer" },
);

/** Answers in the feedback form (SPEC Flow C). */
export const FEEDBACK_OUTCOME_LABELS: Localized<Record<FeedbackOutcome, string>> = dictionary(
  {
    PLAYED: "Hat stattgefunden",
    OPPONENT_NO_SHOW: "Gegner nicht erschienen",
    WE_COULD_NOT: "Wir konnten nicht",
  },
  {
    PLAYED: "Took place",
    OPPONENT_NO_SHOW: "Opponent didn't show up",
    WE_COULD_NOT: "We couldn't make it",
  },
);

export const REQUEST_STATUS_LABELS: Localized<Record<RequestStatus, string>> = dictionary(
  {
    OPEN: "Offen",
    BOOKED: "Gebucht",
    CANCELLED: "Gelöscht",
    EXPIRED: "Verfallen",
    DECLINED: "Abgelehnt",
  },
  {
    OPEN: "Open",
    BOOKED: "Booked",
    CANCELLED: "Deleted",
    EXPIRED: "Expired",
    DECLINED: "Declined",
  },
);

export const SCRIM_STATUS_LABELS: Localized<Record<ScrimStatus, string>> = dictionary(
  {
    SCHEDULED: "Gebucht",
    CANCELLED: "Abgesagt",
    AWAITING_FEEDBACK: "Wartet auf Feedback",
    COMPLETED: "Gespielt",
    NO_SHOW: "No-Show",
    DISPUTED: "Streitfall",
    UNCONFIRMED: "Unbestätigt",
  },
  {
    SCHEDULED: "Booked",
    CANCELLED: "Cancelled",
    AWAITING_FEEDBACK: "Awaiting feedback",
    COMPLETED: "Played",
    NO_SHOW: "No-show",
    DISPUTED: "Dispute",
    UNCONFIRMED: "Unconfirmed",
  },
);

/** Admin list of failed notifications (SPEC P0-9). */
export const NOTIFICATION_TYPE_LABELS: Localized<Record<NotifType, string>> = dictionary(
  {
    VERIFICATION_RESULT: "Ergebnis der Verifizierung",
    APPLICATION_RECEIVED: "Neue Bewerbung",
    APPLICATION_REJECTED: "Bewerbung abgelehnt",
    REQUEST_DELETED: "Anfrage gelöscht",
    REQUEST_EXPIRED: "Anfrage verfallen",
    SCRIM_BOOKED: "Scrim gebucht",
    SCRIM_CANCELLED: "Scrim abgesagt",
    REMINDER_24H: "Reminder 24 h",
    REMINDER_1H: "Reminder 1 h",
    FEEDBACK_PROMPT: "Feedback-Hinweis",
    CHANNEL_BROKEN: "Team-Channel nicht erreichbar",
    DIRECT_REQUEST_RECEIVED: "Neue Direktanfrage",
    DIRECT_REQUEST_DECLINED: "Direktanfrage abgelehnt",
    PARTNERSHIP_ENDED: "Feste Partnerschaft beendet",
    MESSAGE_RECEIVED: "Neue Nachricht",
    STAFF_VERIFICATION_PENDING: "Staff: neue Verifizierung",
    STAFF_MESSAGE_REPORTED: "Staff: Nachricht gemeldet",
    STAFF_TEAM_LIMIT_REQUEST: "Staff: Antrag auf mehr Teams",
    STAFF_DISPUTE: "Staff: strittiges Scrim",
  },
  {
    VERIFICATION_RESULT: "Verification result",
    APPLICATION_RECEIVED: "New application",
    APPLICATION_REJECTED: "Application rejected",
    REQUEST_DELETED: "Request deleted",
    REQUEST_EXPIRED: "Request expired",
    SCRIM_BOOKED: "Scrim booked",
    SCRIM_CANCELLED: "Scrim cancelled",
    REMINDER_24H: "Reminder 24 h",
    REMINDER_1H: "Reminder 1 h",
    FEEDBACK_PROMPT: "Feedback prompt",
    CHANNEL_BROKEN: "Team channel unreachable",
    DIRECT_REQUEST_RECEIVED: "New direct request",
    DIRECT_REQUEST_DECLINED: "Direct request declined",
    PARTNERSHIP_ENDED: "Fixed partnership ended",
    MESSAGE_RECEIVED: "New message",
    STAFF_VERIFICATION_PENDING: "Staff: new verification",
    STAFF_MESSAGE_REPORTED: "Staff: message reported",
    STAFF_TEAM_LIMIT_REQUEST: "Staff: request for more teams",
    STAFF_DISPUTE: "Staff: disputed scrim",
  },
);

/** The channels of the outbox (§5.17), for the admin list and the data export. */
export const NOTIFICATION_CHANNEL_LABELS: Localized<Record<NotifChannel, string>> = dictionary(
  {
    USER_DM: "Discord-DM",
    CAPTAIN_DM: "DM an Captain (alt)",
    TEAM_CHANNEL: "Team-Channel",
    USER_EMAIL: "E-Mail",
    PERSONAL: "Verteilung nach den Einstellungen",
  },
  {
    USER_DM: "Discord DM",
    CAPTAIN_DM: "DM to the captain (old)",
    TEAM_CHANNEL: "Team channel",
    USER_EMAIL: "Email",
    PERSONAL: "Split by the settings",
  },
);

/** Requests for more teams (SPEC N-17). */
export const TEAM_LIMIT_STATUS_LABELS: Localized<Record<TeamLimitStatus, string>> = dictionary(
  { PENDING: "In Prüfung", APPROVED: "Angenommen", REJECTED: "Abgelehnt" },
  { PENDING: "Under review", APPROVED: "Approved", REJECTED: "Rejected" },
);

/** States of a review (SPEC P0-2), for the data export; the account page shows the student status. */
export const VERIF_STATUS_LABELS: Localized<Record<VerifStatus, string>> = dictionary(
  { PENDING: "In Prüfung", APPROVED: "Freigegeben", REJECTED: "Abgelehnt" },
  { PENDING: "Under review", APPROVED: "Approved", REJECTED: "Rejected" },
);

export const NOTIF_STATUS_LABELS: Localized<Record<NotifStatus, string>> = dictionary(
  {
    PENDING: "Wartet auf Versand",
    SENT: "Gesendet",
    FAILED: "Nicht zustellbar",
    CANCELLED: "Verworfen",
  },
  { PENDING: "Waiting to be sent", SENT: "Sent", FAILED: "Undeliverable", CANCELLED: "Discarded" },
);

/** The design choices in the settings (SPEC N-13), in their order there. */
export const THEME_LABELS: Localized<Record<ThemePreference, string>> = dictionary(
  { SYSTEM: "System", LIGHT: "Hell", DARK: "Dunkel" },
  { SYSTEM: "System", LIGHT: "Light", DARK: "Dark" },
);

/** The stored language of an account (SPEC N-18), for the data export. */
export const LOCALE_LABELS: Localized<Record<Locale, string>> = dictionary(
  { DE: "Deutsch", EN: "Englisch" },
  { DE: "German", EN: "English" },
);

/** The two team logos (SPEC N-7). */
export const LOGO_BACKGROUND_LABELS: Localized<Record<LogoBackground, string>> = dictionary(
  { DARK: "Logo für dunklen Hintergrund", LIGHT: "Logo für hellen Hintergrund" },
  { DARK: "Logo for dark backgrounds", LIGHT: "Logo for light backgrounds" },
);
