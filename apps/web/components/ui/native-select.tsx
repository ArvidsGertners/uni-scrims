import * as React from "react";
import { cn } from "cn";
import { controlClass } from "@/components/ui/input";

/** Native select (dark through color-scheme), styled like the inputs. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(controlClass, "min-h-12 px-3", className)}
      {...props}
    />
  );
}

export { NativeSelect };
