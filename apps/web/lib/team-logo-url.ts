import type { TeamLogoInfo } from "@uni-scrims/core";
import type { LogoBackground } from "@uni-scrims/db";

/** URL of one logo; the version changes with every logo change, so caching never shows an old one. */
export function teamLogoUrl(team: { id: string; logo: TeamLogoInfo }, background: LogoBackground) {
  return `/api/teams/${encodeURIComponent(team.id)}/logo?bg=${background.toLowerCase()}&v=${team.logo.version}`;
}
