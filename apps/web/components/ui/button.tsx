import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Buttons of the design handoff: primary, secondary (outline), accent outline (destructive),
// ghost and link. Heights 44/48/52/56 px.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm whitespace-nowrap transition-colors duration-150 select-none disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "type-btn bg-primary font-bold text-primary-foreground not-disabled:hover:bg-primary-hover disabled:bg-secondary disabled:text-faint",
        outline:
          "type-btn border border-border-strong font-semibold text-foreground not-disabled:hover:bg-secondary disabled:text-faint",
        destructive:
          "type-btn border border-primary font-semibold text-accent-text not-disabled:hover:bg-accent-soft disabled:text-faint",
        ghost: "text-muted-foreground not-disabled:hover:text-foreground disabled:text-faint",
        link: "text-muted-foreground underline underline-offset-3 not-disabled:hover:text-accent-text disabled:text-faint",
      },
      size: {
        sm: "min-h-11 px-4 text-[14px]",
        default: "min-h-12 px-5 text-[15px]",
        lg: "min-h-[52px] px-5 text-[16px]",
        xl: "min-h-14 gap-2.5 px-7 text-[17px]",
        bare: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
