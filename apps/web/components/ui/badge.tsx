import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Badges of the design handoff: pill, 26 px high, 13 px semibold; outline is the format tag on
// board cards. Status badges put a 6 px dot in front (<BadgeDot />).
const badgeVariants = cva(
  "inline-flex h-[26px] w-fit shrink-0 items-center gap-1.5 rounded-pill px-2.5 text-[13px] font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-secondary text-muted-foreground",
        accent: "bg-accent-soft text-accent-text",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        outline: "border border-border-strong bg-secondary font-label text-[12px] text-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

function BadgeDot() {
  return <span aria-hidden className="size-1.5 rounded-full bg-current" />;
}

export { Badge, BadgeDot, badgeVariants };
