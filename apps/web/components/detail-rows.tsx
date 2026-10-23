import type { ReactNode } from "react";
import { cn } from "cn";

/** Card with label/value rows and hairlines (verification status, account). */
export function DetailRows({
  rows,
  className,
  children,
}: {
  rows: { label: string; value: ReactNode }[];
  className?: string;
  /** Above the rows, e.g. an eyebrow. */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card px-[18px] py-1",
        className,
      )}
    >
      {children}
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex justify-between gap-3 border-b border-border py-3.5 text-[14px] last:border-b-0"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="flex justify-end text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Status value with a 6 px dot, e.g. "● In Prüfung". */
export function StatusDot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Icon tile above a state headline (verification states). */
export function IconTile({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("flex size-16 items-center justify-center rounded-lg", className)}>
      {children}
    </span>
  );
}
