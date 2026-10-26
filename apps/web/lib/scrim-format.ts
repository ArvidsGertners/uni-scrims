import { type Reliability, SCRIM_FORMAT_LABELS } from "@uni-scrims/core";
import { INTL_LOCALES, type Locale } from "@uni-scrims/core/config/locale";
import type { ScrimFormat } from "@uni-scrims/db";
import { formatMessages } from "../i18n/format.ts";

// Moved to core for the data export (Phase 9, the channels in Phase 18); the pages keep importing
// them from here. Since Phase 22 one map per language (§5.21).
export {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_TYPE_LABELS,
  REQUEST_STATUS_LABELS,
  SCRIM_STATUS_LABELS,
} from "@uni-scrims/core";

export function formatFormat(format: ScrimFormat, locale: Locale): string {
  return SCRIM_FORMAT_LABELS[locale][format];
}

export function formatMaps(maps: string[], locale: Locale): string {
  return maps.length > 0 ? maps.join(" · ") : formatMessages[locale].anyMap;
}

/** "Ø 4,2 ★" */
export function formatRating(avgRating: number, locale: Locale): string {
  const rating = avgRating.toLocaleString(INTL_LOCALES[locale], {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  return `Ø ${rating} ★`;
}

/** Everything after "gespielt", for the team page tile that shows the played count large. */
export function formatReliabilityDetails(reliability: Reliability, locale: Locale): string {
  const t = formatMessages[locale];
  const parts = [t.noShows(reliability.noShows), t.lateCancels(reliability.lateCancels)];
  if (reliability.avgRating !== null) parts.push(formatRating(reliability.avgRating, locale));
  return parts.join(" · ");
}

export function formatUniversities(
  universities: { shown: string[]; more: number },
  locale: Locale,
): string {
  return universities.shown.length > 0
    ? universities.shown.join(", ") + (universities.more > 0 ? ` +${universities.more}` : "")
    : formatMessages[locale].noVerifiedMembers;
}
