import type { MetricKey, MetricResult, MetricUnit } from "@uni-scrims/core";
import { INTL_LOCALES, type Locale, type Localized } from "@uni-scrims/core/config/locale";
import { formatMessages } from "../i18n/format.ts";

const HOUR = 60 * 60 * 1000;

function numberFormats(locale: Locale) {
  return {
    decimal: new Intl.NumberFormat(INTL_LOCALES[locale], { maximumFractionDigits: 1 }),
    rating: new Intl.NumberFormat(INTL_LOCALES[locale], {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    percent: new Intl.NumberFormat(INTL_LOCALES[locale], {
      style: "percent",
      maximumFractionDigits: 1,
    }),
  };
}

const FORMATS: Localized<ReturnType<typeof numberFormats>> = {
  de: numberFormats("de"),
  en: numberFormats("en"),
};

/**
 * Rounded down to `step`, the precision shown. The goals of SPEC §8 lie on that grid, so a shown
 * value never seems to cross a goal the badge next to it says it missed or reached (23.97 h shows
 * as 23.9 h, 49.96 % as 49.9 %). The tiny offset keeps floating point noise like 0.57 × 1000 =
 * 569.99… from rounding a value down by a whole step.
 */
function floorTo(value: number, step: number): number {
  return Math.floor(value / step + 1e-9) * step;
}

/** A metric value or threshold in its unit (SPEC §8): teams, hours, percent or stars. */
export function formatMetricValue(unit: MetricUnit, value: number, locale: Locale): string {
  const { decimal, percent, rating } = FORMATS[locale];
  switch (unit) {
    case "count":
      return String(value);
    case "duration":
      return value < HOUR
        ? `${floorTo(value / 60_000, 1)} min`
        : `${decimal.format(floorTo(value / HOUR, 0.1))} h`;
    case "rate":
      return percent.format(floorTo(value, 0.001));
    case "rating":
      return rating.format(floorTo(value, 0.1));
  }
}

/** "≥ 50 %" or "< 24 h", as the targets read in SPEC §8. */
export function formatThreshold(
  unit: MetricUnit,
  goal: "atLeast" | "below",
  value: number,
  locale: Locale,
) {
  return `${goal === "atLeast" ? "≥" : "<"} ${formatMetricValue(unit, value, locale)}`;
}

/** "aus 3 Prüfungen" / "from 3 reviews", or "von 4 aktiven Teams" for the snapshots. */
export function formatCases(key: MetricKey, result: MetricResult, locale: Locale): string {
  const t = formatMessages[locale];
  const [one, many] = t.caseNouns[key];
  const noun = result.cases === 1 ? one : many;
  return key === "readyTeams" || key === "activeTeams"
    ? t.casesOf(result.cases, noun)
    : t.casesFrom(result.cases, noun);
}
