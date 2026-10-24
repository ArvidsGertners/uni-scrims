import type { ReactNode } from "react";

/** Columns of card lists on wide pages (§5.15): one below 1280 px, up to four from 1920 px. */
/** Lists in the admin area (§5.15): one column below 1280 px, two from there. */
export const LIST_COLUMNS = "grid grid-cols-1 xl:grid-cols-2 xl:items-start";

export const CARD_COLUMNS =
  "grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 min-[120rem]:grid-cols-4";

/** List section with a label, a hairline and a count, e.g. one day on the board. */
export function ListGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="type-label text-foreground">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="type-label font-normal text-faint">{count}</span>
      </div>
      <div className={`${CARD_COLUMNS} gap-3`}>{children}</div>
    </section>
  );
}
