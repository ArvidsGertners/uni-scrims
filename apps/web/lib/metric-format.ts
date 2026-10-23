import type { MetricKey, MetricResult, MetricUnit } from "@uni-scrims/core";

const HOUR = 60 * 60 * 1000;

const decimal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const rating = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });

/** A metric value or threshold in its unit (SPEC §8): teams, hours, percent or stars. */
export function formatMetricValue(unit: MetricUnit, value: number): string {
  switch (unit) {
    case "count":
      return String(value);
    case "duration":
      return value < HOUR
        ? `${Math.round(value / 60_000)} min`
        : `${decimal.format(value / HOUR)} h`;
    case "rate":
      return percent.format(value);
    case "rating":
      return rating.format(value);
  }
}

/** "≥ 50 %" or "< 24 h", as the targets read in SPEC §8. */
export function formatThreshold(unit: MetricUnit, goal: "atLeast" | "below", value: number) {
  return `${goal === "atLeast" ? "≥" : "<"} ${formatMetricValue(unit, value)}`;
}

/** What the number of cases counts, per metric. */
const CASE_NOUNS: Record<MetricKey, [one: string, many: string]> = {
  readyTeams: ["aktiven Team", "aktiven Teams"],
  reviewTime: ["Prüfung", "Prüfungen"],
  confirmationRate: ["Anfrage", "Anfragen"],
  timeToBooking: ["Buchung", "Buchungen"],
  showUpRate: ["Scrim", "Scrims"],
  feedbackRate: ["ausgewerteten Scrim", "ausgewerteten Scrims"],
  activeTeams: ["spielbereiten Team", "spielbereiten Teams"],
  noShowRate: ["Scrim", "Scrims"],
  averageRating: ["Bewertung", "Bewertungen"],
};

export function formatCases(key: MetricKey, result: MetricResult): string {
  const [one, many] = CASE_NOUNS[key];
  const noun = result.cases === 1 ? one : many;
  return key === "readyTeams" || key === "activeTeams"
    ? `von ${result.cases} ${noun}`
    : `aus ${result.cases} ${noun}`;
}
