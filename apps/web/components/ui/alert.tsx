import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { AlertTriangleIcon, CheckIcon } from "@/components/icons";

// Inline alert of the design handoff: warning (e.g. team under 5 players) or success (toast).
const alertVariants = cva("flex gap-2.5 rounded-sm border px-3.5 py-3 text-[14px]", {
  variants: {
    variant: {
      warning: "border-warning-line bg-warning-soft",
      success: "border-success-line bg-success-soft",
    },
  },
  defaultVariants: {
    variant: "warning",
  },
});

function Alert({
  className,
  variant = "warning",
  children,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {variant === "success" ? (
        <CheckIcon size={18} strokeWidth={2.5} className="text-success" />
      ) : (
        <AlertTriangleIcon size={18} className="text-warning" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}

export { Alert };
