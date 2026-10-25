import { TEAM_LINK_TEXTS, type TeamLink, type TeamLinkPlatform } from "@uni-scrims/core";
import { cn } from "cn";
import {
  DiscordIcon,
  InstagramIcon,
  TikTokIcon,
  TwitchIcon,
  XBrandIcon,
  YouTubeIcon,
} from "@/components/brand-icons";
import { GlobeIcon } from "@/components/icons";
import { getMessages } from "@/lib/locale";

const ICONS: Record<TeamLinkPlatform, (props: { size?: number }) => React.ReactNode> = {
  discord: DiscordIcon,
  website: GlobeIcon,
  x: XBrandIcon,
  instagram: InstagramIcon,
  twitch: TwitchIcon,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
};

export function TeamLinkIcon({
  platform,
  size = 16,
}: {
  platform: TeamLinkPlatform;
  size?: number;
}) {
  const Icon = ICONS[platform];
  return <Icon size={size} />;
}

/** Shared by all links that leave the site: new tab, no referrer, no ranking for the target. */
export const EXTERNAL_LINK_PROPS = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
} as const;

/**
 * The external links of a team as a row of small icons next to its name (SPEC N-15); nothing
 * without links. The icons are part of the bundle, so showing them loads nothing from elsewhere.
 */
export async function TeamLinks({
  teamName,
  links,
  className,
}: {
  teamName: string;
  links: TeamLink[];
  className?: string;
}) {
  if (links.length === 0) return null;
  const platforms = await getMessages(TEAM_LINK_TEXTS);
  return (
    <ul className={cn("flex flex-wrap items-center", className)}>
      {links.map((link) => {
        const label = `${platforms[link.platform].label} von ${teamName}`;
        return (
          <li key={link.platform}>
            <a
              href={link.url}
              {...EXTERNAL_LINK_PROPS}
              aria-label={label}
              title={label}
              className="flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <TeamLinkIcon platform={link.platform} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
