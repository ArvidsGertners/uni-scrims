import {
  type FeedbackOutcome,
  MemberRole,
  type NotifStatus,
  type NotifType,
  type RequestStatus,
  type ScrimFormat,
  type ScrimStatus,
  type StaffRole,
  type VerifStatus,
} from "@uni-scrims/db";

/** Display names of the formats (SPEC P0-4). */
export const SCRIM_FORMAT_LABELS: Record<ScrimFormat, string> = {
  ONE_MAP: "1 Map",
  TWO_MAPS: "2 Maps",
  BO3: "BO3",
};

/** Roles of team members in the order the team page offers them (SPEC N-1). */
export const MEMBER_ROLES: readonly MemberRole[] = [
  MemberRole.PLAYER,
  MemberRole.SUBSTITUTE,
  MemberRole.COACH,
];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  PLAYER: "Spieler",
  SUBSTITUTE: "Ersatzspieler",
  COACH: "Coach",
};

/** Staff roles (SPEC N-4). */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OPERATOR: "Betreiber",
  ADMIN: "Admin",
  REVIEWER: "Prüfer",
};

/** Answers in the feedback form (SPEC Flow C). */
export const FEEDBACK_OUTCOME_LABELS: Record<FeedbackOutcome, string> = {
  PLAYED: "Hat stattgefunden",
  OPPONENT_NO_SHOW: "Gegner nicht erschienen",
  WE_COULD_NOT: "Wir konnten nicht",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: "Offen",
  BOOKED: "Gebucht",
  CANCELLED: "Gelöscht",
  EXPIRED: "Verfallen",
};

export const SCRIM_STATUS_LABELS: Record<ScrimStatus, string> = {
  SCHEDULED: "Gebucht",
  CANCELLED: "Abgesagt",
  AWAITING_FEEDBACK: "Wartet auf Feedback",
  COMPLETED: "Gespielt",
  NO_SHOW: "No-Show",
  DISPUTED: "Streitfall",
  UNCONFIRMED: "Unbestätigt",
};

/** Admin list of failed notifications (SPEC P0-9). */
export const NOTIFICATION_TYPE_LABELS: Record<NotifType, string> = {
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
};

/** States of a review (SPEC P0-2), as the account page names them. */
export const VERIF_STATUS_LABELS: Record<VerifStatus, string> = {
  PENDING: "In Prüfung",
  APPROVED: "Freigegeben",
  REJECTED: "Abgelehnt",
};

export const NOTIF_STATUS_LABELS: Record<NotifStatus, string> = {
  PENDING: "Wartet auf Versand",
  SENT: "Gesendet",
  FAILED: "Nicht zustellbar",
  CANCELLED: "Verworfen",
};
