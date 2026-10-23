import * as React from "react";
import { cn } from "cn";

/** Label above a control (design handoff: 14 px medium). */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label data-slot="label" className={cn("text-[14px] font-medium", className)} {...props} />
  );
}

export { Label };
