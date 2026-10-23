import { RANK_LABELS, type Reliability, SCRIM_FORMAT_LABELS } from "@uni-scrims/core";
import type { AppStatus, NotifChannel, Rank, ScrimFormat } from "@uni-scrims/db";

// Moved to core for the data export (Phase 9); the pages keep importing them from here.
export {
  NOTIFICATION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  SCRIM_STATUS_LABELS,
} from "@uni-scrims/core";

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

export const APPLICATION_STATUS_LABELS: Record<AppStatus, string> = {
  PENDING: "Offen",
  ACCEPTED: "Bestätigt",
  REJECTED: "Abgelehnt",
  WITHDRAWN: "Zurückgezogen",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotifChannel, string> = {
  USER_DM: "DM an Nutzer",
  CAPTAIN_DM: "DM an Captain",
  TEAM_CHANNEL: "Team-Channel",
};
