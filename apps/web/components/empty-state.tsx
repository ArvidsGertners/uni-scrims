import type { ReactNode } from "react";

/** Dashed empty state of the design handoff, with an optional icon tile and action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3.5 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
      {icon ? (
        <span className="flex size-14 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <h2 className="type-h2">{title}</h2>
      <p className="max-w-[360px] text-pretty text-muted-foreground">{children}</p>
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}
