"use client";

import type { TeamLogoInfo } from "@uni-scrims/core";
import { cn } from "cn";
import { useTheme } from "@/components/theme-provider";
import { teamLogoUrl } from "@/lib/team-logo-url";

/**
 * The logo of TeamAvatar for the current mode: the system setting or the account's choice (SPEC
 * N-13), which comes from ThemeProvider. Gets only what it shows, so pages pass no further team data
 * to the browser.
 */
export function TeamLogoImage({
  team,
  className,
}: {
  team: { id: string; logo: TeamLogoInfo };
  className?: string;
}) {
  const theme = useTheme();
  const { logo } = team;
  const dark = logo.backgrounds.includes("DARK");
  const light = logo.backgrounds.includes("LIGHT");
  const imageClass = cn(
    "shrink-0 object-contain",
    // Only one logo: in the other mode it stands on a tile in the colour it was made for.
    !light && "light:bg-logo-tile-dark light:p-[12%]",
    !dark && "dark:bg-logo-tile-light dark:p-[12%]",
    className,
  );
  if (dark && light && theme === "SYSTEM") {
    return (
      // The browser picks the logo for the system setting, without JavaScript.
      <picture className="shrink-0">
        <source media="(prefers-color-scheme: light)" srcSet={teamLogoUrl(team, "LIGHT")} />
        <img
          src={teamLogoUrl(team, "DARK")}
          alt=""
          loading="lazy"
          decoding="async"
          className={imageClass}
        />
      </picture>
    );
  }
  // One logo, or the account chose a design (§5.16): the logo for that mode, if there is one.
  const background =
    dark && light ? (theme === "LIGHT" ? "LIGHT" : "DARK") : dark ? "DARK" : "LIGHT";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small session-protected image, no optimisation
    <img
      src={teamLogoUrl(team, background)}
      alt=""
      loading="lazy"
      decoding="async"
      className={imageClass}
    />
  );
}
