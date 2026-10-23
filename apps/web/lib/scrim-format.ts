import { RANK_LABELS, type Reliability, SCRIM_FORMAT_LABELS } from "@uni-scrims/core";
import type {
  AppStatus,
  NotifChannel,
  NotifType,
  Rank,
  RequestStatus,
  ScrimFormat,
  ScrimStatus,
} from "@uni-scrims/db";

export function formatRankRange(rankMin: Rank, rankMax: Rank): string {
  return rankMin === rankMax
    ? RANK_LABELS[rankMin]
    : `${RANK_LABELS[rankMin]} – ${RANK_LABELS[rankMax]}`;
}

export function formatFormat(format: ScrimFormat): string {
  return SCRIM_FORMAT_LABELS[format];
}

export function formatMaps(maps: string[]): string {
  return maps.length > 0 ? maps.join(" · ") : "Freie Wahl";
}

/** "3 gespielt · 1 No-Show · 0 kurzfristige Absagen · Ø 4,2 ★" */
export function formatReliability(reliability: Reliability): string {
  const parts = [
    `${reliability.played} gespielt`,
    `${reliability.noShows} ${reliability.noShows === 1 ? "No-Show" : "No-Shows"}`,
    `${reliability.lateCancels} kurzfristige ${reliability.lateCancels === 1 ? "Absage" : "Absagen"}`,
  ];
  if (reliability.avgRating !== null) {
    parts.push(
      `Ø ${reliability.avgRating.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} ★`,
    );
  }
  return parts.join(" · ");
}

export function formatUniversities(universities: { shown: string[]; more: number }): string {
  return universities.shown.length > 0
    ? universities.shown.join(", ") + (universities.more > 0 ? ` +${universities.more}` : "")
    : "Noch keine verifizierten Mitglieder";
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: "Offen",
  BOOKED: "Gebucht",
  CANCELLED: "Gelöscht",
  EXPIRED: "Verfallen",
};

export const APPLICATION_STATUS_LABELS: Record<AppStatus, string> = {
  PENDING: "Offen",
  ACCEPTED: "Bestätigt",
  REJECTED: "Abgelehnt",
  WITHDRAWN: "Zurückgezogen",
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

export const NOTIFICATION_CHANNEL_LABELS: Record<NotifChannel, string> = {
  USER_DM: "DM an Nutzer",
  CAPTAIN_DM: "DM an Captain",
  TEAM_CHANNEL: "Team-Channel",
};
