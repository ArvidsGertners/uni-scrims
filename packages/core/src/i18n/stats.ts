// Names and definitions of the success metrics (SPEC §8, N-2) in both languages (§5.21).
import { READY_MEMBER_COUNT } from "../../config/limits.ts";
import { dictionary } from "../../config/locale.ts";
import { ACTIVE_TEAM_DAYS, ACTIVE_TEAM_MIN_SCRIMS, type MetricKey } from "../stats.ts";

type MetricTexts = Record<MetricKey, { label: string; description: string }>;

const de: MetricTexts = {
  readyTeams: {
    label: "Spielbereite Teams",
    description: `Aktive Teams mit mindestens ${READY_MEMBER_COUNT} verifizierten Spielern, Stand jetzt.`,
  },
  reviewTime: {
    label: "Prüfzeit",
    description: "Median von Upload bis Entscheidung, nur von Hand entschiedene Prüfungen.",
  },
  confirmationRate: {
    label: "Bestätigungsquote",
    description: "Bestätigte ÷ (bestätigte + verfallene) Anfragen, deren Start vorbei ist.",
  },
  timeToBooking: {
    label: "Zeit bis Bestätigung",
    description: "Median von Anfrage erstellt bis Scrim gebucht.",
  },
  showUpRate: { label: "Show-up-Rate", description: "Gespielt ÷ (Gespielt + No-Show)." },
  feedbackRate: {
    label: "Feedback-Antwortrate",
    description: "Scrims mit mindestens einer Antwort ÷ ausgewertete Scrims.",
  },
  activeTeams: {
    label: `Teams mit ≥ ${ACTIVE_TEAM_MIN_SCRIMS} Scrims pro Monat`,
    description: `Spielbereite Teams mit mindestens ${ACTIVE_TEAM_MIN_SCRIMS} gespielten Scrims in den letzten ${ACTIVE_TEAM_DAYS} Tagen, Stand jetzt.`,
  },
  noShowRate: { label: "No-Show-Rate", description: "No-Show ÷ (Gespielt + No-Show)." },
  averageRating: {
    label: "Durchschnittsbewertung",
    description: "Bewertungen aus gespielten Scrims.",
  },
};

export const METRIC_TEXTS = dictionary(de, {
  readyTeams: {
    label: "Ready teams",
    description: `Active teams with at least ${READY_MEMBER_COUNT} verified players, as of now.`,
  },
  reviewTime: {
    label: "Review time",
    description: "Median from upload to decision, reviews decided by hand only.",
  },
  confirmationRate: {
    label: "Confirmation rate",
    description: "Confirmed ÷ (confirmed + expired) requests whose start has passed.",
  },
  timeToBooking: {
    label: "Time to booking",
    description: "Median from request created to scrim booked.",
  },
  showUpRate: { label: "Show-up rate", description: "Played ÷ (played + no-show)." },
  feedbackRate: {
    label: "Feedback response rate",
    description: "Scrims with at least one answer ÷ evaluated scrims.",
  },
  activeTeams: {
    label: `Teams with ≥ ${ACTIVE_TEAM_MIN_SCRIMS} scrims per month`,
    description: `Ready teams with at least ${ACTIVE_TEAM_MIN_SCRIMS} played scrims in the last ${ACTIVE_TEAM_DAYS} days, as of now.`,
  },
  noShowRate: { label: "No-show rate", description: "No-show ÷ (played + no-show)." },
  averageRating: { label: "Average rating", description: "Ratings from played scrims." },
});
