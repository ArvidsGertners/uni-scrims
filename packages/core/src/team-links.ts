// External team links (SPEC N-15, ARCHITECTURE §5.18): seven fixed platforms, https only, the host
// checked per platform. What a link leads to is not checked; admins remove bad ones.

import { TEAM_LINK_MAX } from "../config/limits.ts";
import { type Message, msg } from "./i18n/render.ts";

export { TEAM_LINK_MAX };

export type TeamLinkPlatform =
  "discord" | "website" | "x" | "instagram" | "twitch" | "youtube" | "tiktok";

type TeamLinkField =
  "discordUrl" | "websiteUrl" | "xUrl" | "instagramUrl" | "twitchUrl" | "youtubeUrl" | "tiktokUrl";

type PlatformRule = {
  key: TeamLinkPlatform;
  field: TeamLinkField;
  /** Whether host (without "www.") and path fit the platform. Names and hints: i18n/team-links.ts. */
  accepts: (host: string, path: string) => boolean;
};

/** A profile path: something after the slash. */
const PROFILE_PATH = /^\/[^/]/;

function profileOn(...hosts: string[]) {
  return (host: string, path: string) => hosts.includes(host) && PROFILE_PATH.test(path);
}

const IPV4 = /^\d+(\.\d+){3}$/;

/** In this order on every page. */
export const TEAM_LINK_PLATFORMS: readonly PlatformRule[] = [
  {
    key: "discord",
    field: "discordUrl",
    // Server invites only, not profiles or channels.
    accepts: (host, path) =>
      (host === "discord.gg" && /^\/[\w-]+\/?$/.test(path)) ||
      (host === "discord.com" && /^\/invite\/[\w-]+\/?$/.test(path)),
  },
  {
    key: "website",
    field: "websiteUrl",
    // Any domain, but no IP address and no local name.
    accepts: (host) =>
      /^[^.]+(\.[^.]+)+$/.test(host) &&
      !IPV4.test(host) &&
      !host.startsWith("[") &&
      !host.endsWith(".localhost"),
  },
  {
    key: "x",
    field: "xUrl",
    accepts: profileOn("x.com", "twitter.com"),
  },
  {
    key: "instagram",
    field: "instagramUrl",
    accepts: profileOn("instagram.com"),
  },
  {
    key: "twitch",
    field: "twitchUrl",
    accepts: profileOn("twitch.tv"),
  },
  {
    key: "youtube",
    field: "youtubeUrl",
    accepts: profileOn("youtube.com", "m.youtube.com"),
  },
  {
    key: "tiktok",
    field: "tiktokUrl",
    accepts: (host, path) => host === "tiktok.com" && /^\/@[^/]/.test(path),
  },
];

function platformRule(key: TeamLinkPlatform): PlatformRule {
  const rule = TEAM_LINK_PLATFORMS.find((platform) => platform.key === key);
  if (!rule) throw new Error(`Unknown team link platform: ${key}`);
  return rule;
}

/**
 * Checks one form field: empty means no link (null), otherwise the normalized https address.
 * Without a scheme "https://" is put in front; other schemes are rejected.
 */
export function parseTeamLink(
  key: TeamLinkPlatform,
  raw: string,
): { url: string | null } | { error: Message } {
  const rule = platformRule(key);
  const fail = (
    messageKey:
      | "teamLinkTooLong"
      | "teamLinkInvalid"
      | "teamLinkNotHttps"
      | "teamLinkCredentials"
      | "teamLinkWrongHost",
  ) => ({ error: msg(messageKey, { platform: rule.key }) });
  const value = raw.trim();
  if (value === "") return { url: null };
  if (value.length > TEAM_LINK_MAX) return fail("teamLinkTooLong");
  let url: URL;
  try {
    // A scheme only at the start: "://" later in the address (e.g. in a query) is not one.
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return fail("teamLinkInvalid");
  }
  if (url.protocol !== "https:") return fail("teamLinkNotHttps");
  if (url.username || url.password || url.port) return fail("teamLinkCredentials");
  if (!rule.accepts(url.hostname.replace(/^www\./, ""), url.pathname)) {
    return fail("teamLinkWrongHost");
  }
  if (url.href.length > TEAM_LINK_MAX) return fail("teamLinkTooLong");
  return { url: url.href };
}

/** Columns of the links, for the reads that show them. */
export const teamLinksSelect = {
  discordUrl: true,
  websiteUrl: true,
  xUrl: true,
  instagramUrl: true,
  twitchUrl: true,
  youtubeUrl: true,
  tiktokUrl: true,
} as const;

export type TeamLinkRow = Record<TeamLinkField, string | null>;

/** The columns for the checked form values (teamLinksSchema); null removes a link. */
export function teamLinkColumns(links: Record<TeamLinkPlatform, string | null>): TeamLinkRow {
  return Object.fromEntries(
    TEAM_LINK_PLATFORMS.map((platform) => [platform.field, links[platform.key]]),
  ) as TeamLinkRow;
}

/** All link columns empty, for dissolving a team and for admins. */
export const NO_TEAM_LINKS: TeamLinkRow = Object.fromEntries(
  TEAM_LINK_PLATFORMS.map((platform) => [platform.field, null]),
) as TeamLinkRow;

export type TeamLink = { platform: TeamLinkPlatform; url: string };

/** The links that are set, in the fixed order. */
export function toTeamLinks(row: TeamLinkRow): TeamLink[] {
  return TEAM_LINK_PLATFORMS.flatMap((platform) => {
    const url = row[platform.field];
    return url ? [{ platform: platform.key, url }] : [];
  });
}

/** Version of the links an admin saw before removing them; null without links. */
export function linksVersion(team: { linksUpdatedAt: Date | null }): number | null {
  return team.linksUpdatedAt?.getTime() ?? null;
}
