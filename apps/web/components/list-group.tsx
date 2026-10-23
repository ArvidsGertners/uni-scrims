import type { ReactNode } from "react";

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
      {children}
    </section>
  );
}
