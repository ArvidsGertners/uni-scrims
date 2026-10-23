import { cn } from "cn";
import type { ReactNode } from "react";

/** Dashed empty state of the design handoff, with an optional icon tile and action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** Tabs of "Meine Scrims": less padding and gap, narrower text. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-border-strong px-6 text-center",
        compact ? "gap-3 py-10" : "gap-3.5 py-12",
      )}
    >
      {icon ? (
        <span className="flex size-14 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <h2 className="type-h2">{title}</h2>
      <p
        className={cn(
          "text-pretty text-muted-foreground",
          compact ? "max-w-[340px]" : "max-w-[360px]",
        )}
      >
        {children}
      </p>
      {action ? <div className={compact ? "mt-1" : "mt-1.5"}>{action}</div> : null}
    </div>
  );
}
