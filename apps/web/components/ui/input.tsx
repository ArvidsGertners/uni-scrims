import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

/**
 * Form controls of the design handoff: 48 px, 16 px text (no iOS zoom), accent border and soft ring
 * on focus. The placeholder color is Chrome's default, which the prototype shows (token, §11 Phase 11).
 */
export const controlClass =
  "w-full min-w-0 rounded-sm border border-border bg-input text-[16px] text-foreground outline-none placeholder:text-placeholder focus:border-ring focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-secondary aria-invalid:border-destructive";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(controlClass, "min-h-12 px-3.5", className)}
      {...props}
    />
  );
}

export { Input };
