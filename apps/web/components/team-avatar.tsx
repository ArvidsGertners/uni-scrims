import { cn } from "cn";

const SIZES = {
  sm: "size-10 rounded-sm text-[11px]",
  md: "size-11 rounded-[10px] text-[12px]",
  lg: "size-16 rounded-lg text-[15px]",
};

/** The team "logo" of the design handoff: its tag in a square; the own team on accent. */
export function TeamAvatar({
  tag,
  size = "md",
  own = false,
  className,
}: {
  tag: string;
  size?: keyof typeof SIZES;
  own?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-label font-bold uppercase",
        SIZES[size],
        own
          ? "bg-primary text-primary-foreground"
          : "border border-border-strong bg-secondary text-foreground",
        own && size === "lg" && "text-[16px]",
        className,
      )}
    >
      {tag}
    </span>
  );
}
