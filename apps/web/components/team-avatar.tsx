import { cn } from "cn";

const SIZES = {
  sm: "size-10 rounded-sm text-[11px]",
  md: "size-11 rounded-[10px] text-[12px]",
  lg: "size-16 rounded-lg text-[15px]",
};

export type AvatarTeam = { id: string; tag: string; logoVersion: number | null };

/**
 * The team logo (SPEC N-6), filling the square; without one the "logo" of the design handoff: the
 * tag in a square, the own team on accent.
 */
export function TeamAvatar({
  team,
  size = "md",
  own = false,
  className,
}: {
  team: AvatarTeam;
  size?: keyof typeof SIZES;
  own?: boolean;
  className?: string;
}) {
  if (team.logoVersion !== null) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small session-protected image, no optimisation
      <img
        // The version changes with every new logo, so the long browser cache never shows an old one.
        src={`/api/teams/${encodeURIComponent(team.id)}/logo?v=${team.logoVersion}`}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 object-contain", SIZES[size], className)}
      />
    );
  }
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
      {team.tag}
    </span>
  );
}
