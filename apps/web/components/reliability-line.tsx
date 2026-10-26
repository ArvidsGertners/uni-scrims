import type { Reliability } from "@uni-scrims/core";
import { RELIABILITY_WINDOW_DAYS } from "@uni-scrims/core/config/limits";
import { cn } from "cn";
import type { ReactNode } from "react";
import { getLocale, getMessages } from "@/lib/locale";
import { formatRating } from "@/lib/scrim-format";
import { formatMessages, reliabilityMessages } from "@/i18n/format";

/**
 * The reliability of the last days in its own line (SPEC N-23): played, no-shows and late
 * cancellations, the latter two highlighted above 0, and the average rating from 3 ratings on.
 */
export async function ReliabilityLine({
  reliability,
  className,
}: {
  reliability: Reliability;
  className?: string;
}) {
  const locale = await getLocale();
  const t = formatMessages[locale];
  const r = await getMessages(reliabilityMessages);
  const flagged = (count: number) => (count > 0 ? "font-medium text-warning" : undefined);
  const parts: ReactNode[] = [
    <span key="played">{t.played(reliability.played)}</span>,
    <span key="noShows" className={flagged(reliability.noShows)}>
      {t.noShows(reliability.noShows)}
    </span>,
    <span key="lateCancels" className={flagged(reliability.lateCancels)}>
      {t.lateCancels(reliability.lateCancels)}
    </span>,
  ];
  if (reliability.avgRating !== null) {
    parts.push(<span key="rating">{formatRating(reliability.avgRating, locale)}</span>);
  }
  return (
    <p className={cn("text-[13px] text-pretty text-muted-foreground", className)}>
      <span className="text-foreground">{r.lastDays(RELIABILITY_WINDOW_DAYS)}</span>{" "}
      {parts.flatMap((part, index) => (index === 0 ? [part] : [" · ", part]))}
    </p>
  );
}
