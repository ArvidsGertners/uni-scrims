// Texts of the shared formatters in lib/ (§5.21).
import type { MetricKey } from "@uni-scrims/core";
import { dictionary } from "@uni-scrims/core/config/locale";
import type { AppStatus } from "@uni-scrims/db";

const de = {
  /** A request without chosen maps. */
  anyMap: "Freie Wahl",
  played: (count: number) => `${count} gespielt`,
  noShows: (count: number) => `${count} ${count === 1 ? "No-Show" : "No-Shows"}`,
  lateCancels: (count: number) => `${count} kurzfristige ${count === 1 ? "Absage" : "Absagen"}`,
  noVerifiedMembers: "Noch keine verifizierten Mitglieder",
  applicationStatus: {
    PENDING: "Offen",
    ACCEPTED: "Bestätigt",
    REJECTED: "Abgelehnt",
    WITHDRAWN: "Zurückgezogen",
  } as Record<AppStatus, string>,
  /** After a date with time from formatDateTime. */
  timeSuffix: " Uhr",
  /** What the number of cases of a success metric counts. */
  caseNouns: {
    readyTeams: ["aktiven Team", "aktiven Teams"],
    reviewTime: ["Prüfung", "Prüfungen"],
    confirmationRate: ["Anfrage", "Anfragen"],
    timeToBooking: ["Buchung", "Buchungen"],
    showUpRate: ["Scrim", "Scrims"],
    feedbackRate: ["ausgewerteten Scrim", "ausgewerteten Scrims"],
    activeTeams: ["spielbereiten Team", "spielbereiten Teams"],
    noShowRate: ["Scrim", "Scrims"],
    averageRating: ["Bewertung", "Bewertungen"],
  } as Record<MetricKey, [one: string, many: string]>,
  /** A snapshot: n of all. */
  casesOf: (cases: number, noun: string) => `von ${cases} ${noun}`,
  /** A computed value: from n cases. */
  casesFrom: (cases: number, noun: string) => `aus ${cases} ${noun}`,
};

export const formatMessages = dictionary(de, {
  anyMap: "Any",
  played: (count) => `${count} played`,
  noShows: (count) => `${count} ${count === 1 ? "no-show" : "no-shows"}`,
  lateCancels: (count) => `${count} late ${count === 1 ? "cancellation" : "cancellations"}`,
  noVerifiedMembers: "No verified members yet",
  applicationStatus: {
    PENDING: "Open",
    ACCEPTED: "Accepted",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrawn",
  },
  timeSuffix: "",
  caseNouns: {
    readyTeams: ["active team", "active teams"],
    reviewTime: ["review", "reviews"],
    confirmationRate: ["request", "requests"],
    timeToBooking: ["booking", "bookings"],
    showUpRate: ["scrim", "scrims"],
    feedbackRate: ["evaluated scrim", "evaluated scrims"],
    activeTeams: ["ready team", "ready teams"],
    noShowRate: ["scrim", "scrims"],
    averageRating: ["rating", "ratings"],
  },
  casesOf: (cases, noun) => `of ${cases} ${noun}`,
  casesFrom: (cases, noun) => `from ${cases} ${noun}`,
});
