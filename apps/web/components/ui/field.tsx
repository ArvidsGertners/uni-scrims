import type { ReactNode } from "react";
import { cn } from "cn";

/** Label above a control (design handoff): 14 px medium, optional hint on the right in faint. */
function Field({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="flex justify-between text-[14px] font-medium">
        {label}
        {hint ? <span className="font-normal text-faint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export { Field };
