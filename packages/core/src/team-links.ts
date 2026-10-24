// External team links (SPEC N-15, ARCHITECTURE §5.18): seven fixed platforms, https only, the host
// checked per platform. What a link leads to is not checked; admins remove bad ones.

export const TEAM_LINK_MAX = 300;

export type TeamLinkPlatform =
  "discord" | "website" | "x" | "instagram" | "twitch" | "youtube" | "tiktok";

type TeamLinkField =
  "discordUrl" | "websiteUrl" | "xUrl" | "instagramUrl" | "twitchUrl" | "youtubeUrl" | "tiktokUrl";

type PlatformRule = {
  key: TeamLinkPlatform;
  field: TeamLinkField;
  label: string;
  placeholder: string;
  /** Whether host (without "www.") and path fit the platform. */
  accepts: (host: string, path: string) => boolean;
  /** Completes "Bitte …" when they do not. */
  hint: string;
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
    label: "Discord-Server",
    placeholder: "discord.gg/…",
    // Server invites only, not profiles or channels.
    accepts: (host, path) =>
      (host === "discord.gg" && /^\/[\w-]+\/?$/.test(path)) ||
      (host === "discord.com" && /^\/invite\/[\w-]+\/?$/.test(path)),
    hint: "einen Einladungslink zu eurem Server angeben (discord.gg/… oder discord.com/invite/…)",
  },
  {
    key: "website",
    field: "websiteUrl",
    label: "Website",
    placeholder: "eure-seite.de",
    // Any domain, but no IP address and no local name.
    accepts: (host) =>
      /^[^.]+(\.[^.]+)+$/.test(host) &&
      !IPV4.test(host) &&
      !host.startsWith("[") &&
      !host.endsWith(".localhost"),
    hint: "eine Adresse mit Domain angeben, z. B. eure-seite.de",
  },
  {
    key: "x",
    field: "xUrl",
    label: "X",
    placeholder: "x.com/…",
    accepts: profileOn("x.com", "twitter.com"),
    hint: "einen Link zu eurem Profil auf x.com oder twitter.com angeben",
  },
  {
    key: "instagram",
    field: "instagramUrl",
    label: "Instagram",
    placeholder: "instagram.com/…",
    accepts: profileOn("instagram.com"),
    hint: "einen Link zu eurem Profil auf instagram.com angeben",
  },
  {
    key: "twitch",
    field: "twitchUrl",
    label: "Twitch",
    placeholder: "twitch.tv/…",
    accepts: profileOn("twitch.tv"),
    hint: "einen Link zu eurem Kanal auf twitch.tv angeben",
  },
  {
    key: "youtube",
    field: "youtubeUrl",
    label: "YouTube",
    placeholder: "youtube.com/@…",
    accepts: profileOn("youtube.com", "m.youtube.com"),
    hint: "einen Link zu eurem Kanal auf youtube.com angeben",
  },
  {
    key: "tiktok",
    field: "tiktokUrl",
    label: "TikTok",
    placeholder: "tiktok.com/@…",
    accepts: (host, path) => host === "tiktok.com" && /^\/@[^/]/.test(path),
    hint: "einen Link zu eurem Profil auf tiktok.com angeben (tiktok.com/@…)",
  },
];

export const TEAM_LINK_LABELS = Object.fromEntries(
  TEAM_LINK_PLATFORMS.map((platform) => [platform.key, platform.label]),
) as Record<TeamLinkPlatform, string>;

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
): { url: string | null } | { error: string } {
  const rule = platformRule(key);
  const fail = (message: string) => ({ error: `${rule.label}: ${message}` });
  const value = raw.trim();
  if (value === "") return { url: null };
  if (value.length > TEAM_LINK_MAX) {
    return fail(`Der Link darf höchstens ${TEAM_LINK_MAX} Zeichen haben.`);
  }
  let url: URL;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    return fail("Das ist kein gültiger Link.");
  }
  if (url.protocol !== "https:") return fail("Bitte einen https-Link angeben.");
  if (url.username || url.password || url.port) {
    return fail("Der Link darf keine Zugangsdaten und keinen Port enthalten.");
  }
  if (!rule.accepts(url.hostname.replace(/^www\./, ""), url.pathname)) {
    return fail(`Bitte ${rule.hint}.`);
  }
  if (url.href.length > TEAM_LINK_MAX) {
    return fail(`Der Link darf höchstens ${TEAM_LINK_MAX} Zeichen haben.`);
  }
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
