import type { TeamLogoInfo } from "@uni-scrims/core";
import type { LogoBackground } from "@uni-scrims/db";
import { cn } from "cn";

const SIZES = {
  sm: "size-10 rounded-sm text-[11px]",
  md: "size-11 rounded-[10px] text-[12px]",
  lg: "size-16 rounded-lg text-[15px]",
};

export type AvatarTeam = { id: string; tag: string; logo: TeamLogoInfo | null };

/** URL of one logo; the version changes with every logo change, so caching never shows an old one. */
export function teamLogoUrl(team: { id: string; logo: TeamLogoInfo }, background: LogoBackground) {
  return `/api/teams/${encodeURIComponent(team.id)}/logo?bg=${background.toLowerCase()}&v=${team.logo.version}`;
}

/**
 * The team logo (SPEC N-6, N-7) for the current mode, filling the square; without one the "logo"
 * of the design handoff: the tag in a square, the own team on accent.
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
  const { logo } = team;
  if (logo) {
    const dark = logo.backgrounds.includes("DARK");
    const light = logo.backgrounds.includes("LIGHT");
    const imageClass = cn(
      "shrink-0 object-contain",
      SIZES[size],
      // Only one logo: in the other mode it stands on a tile in the colour it was made for.
      !light && "light:bg-logo-tile-dark light:p-[12%]",
      !dark && "dark:bg-logo-tile-light dark:p-[12%]",
      className,
    );
    const src = teamLogoUrl({ id: team.id, logo }, dark ? "DARK" : "LIGHT");
    return (
      // The browser picks the logo for the system setting, without JavaScript.
      <picture className="shrink-0">
        {dark && light ? (
          <source
            media="(prefers-color-scheme: light)"
            srcSet={teamLogoUrl({ id: team.id, logo }, "LIGHT")}
          />
        ) : null}
        <img src={src} alt="" loading="lazy" decoding="async" className={imageClass} />
      </picture>
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

/** One logo on the background it is made for, whatever the mode (team page, admin). */
export function TeamLogoPreview({
  team,
  background,
  className,
}: {
  team: { id: string; logo: TeamLogoInfo | null };
  background: LogoBackground;
  className?: string;
}) {
  const { logo } = team;
  return (
    <span
      className={cn(
        "flex size-16 shrink-0 items-center justify-center rounded-lg border border-border-strong p-1.5",
        background === "DARK" ? "bg-logo-tile-dark" : "bg-logo-tile-light",
        className,
      )}
    >
      {logo?.backgrounds.includes(background) ? (
        // eslint-disable-next-line @next/next/no-img-element -- small session-protected image, no optimisation
        <img
          src={teamLogoUrl({ id: team.id, logo }, background)}
          alt=""
          className="size-full object-contain"
        />
      ) : (
        <span
          className={cn(
            "text-[11px]",
            // The other tile colour, faded: readable on this fixed surface in both modes.
            background === "DARK" ? "text-logo-tile-light/60" : "text-logo-tile-dark/60",
          )}
        >
          Keins
        </span>
      )}
    </span>
  );
}
