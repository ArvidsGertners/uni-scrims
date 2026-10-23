import type { ComponentProps } from "react";
import { cn } from "cn";

/**
 * Toggle button of the design handoff (feedback answers), as a label around a hidden radio or
 * checkbox, so forms submit it natively.
 */
export function ToggleOption({
  label,
  className,
  ...input
}: Omit<ComponentProps<"input">, "className"> & {
  type: "radio" | "checkbox";
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "type-btn flex min-h-[52px] cursor-pointer items-center justify-center rounded-sm border border-border bg-card px-2 text-center text-[15px] font-semibold text-muted-foreground hover:border-muted-foreground has-checked:border-primary has-checked:bg-accent-soft has-checked:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        className,
      )}
    >
      <input className="sr-only" {...input} />
      {label}
    </label>
  );
}
