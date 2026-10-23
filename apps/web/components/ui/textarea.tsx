import * as React from "react";
import { cn } from "cn";
import { controlClass } from "@/components/ui/input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "resize-y px-3.5 py-3", className)}
      {...props}
    />
  );
}

export { Textarea };
