// Names, placeholders and hints of the external team links (SPEC N-15) in both languages (§5.21).
import { dictionary } from "../../config/locale.ts";
import type { TeamLinkPlatform } from "../team-links.ts";

type PlatformTexts = Record<
  TeamLinkPlatform,
  {
    label: string;
    placeholder: string;
    /** Completes "Bitte …" / "Please …" when a link does not fit the platform. */
    hint: string;
  }
>;

const de: PlatformTexts = {
  discord: {
    label: "Discord-Server",
    placeholder: "discord.gg/…",
    hint: "einen Einladungslink zu eurem Server angeben (discord.gg/… oder discord.com/invite/…)",
  },
  website: {
    label: "Website",
    placeholder: "eure-seite.de",
    hint: "eine Adresse mit Domain angeben, z. B. eure-seite.de",
  },
  x: {
    label: "X",
    placeholder: "x.com/…",
    hint: "einen Link zu eurem Profil auf x.com oder twitter.com angeben",
  },
  instagram: {
    label: "Instagram",
    placeholder: "instagram.com/…",
    hint: "einen Link zu eurem Profil auf instagram.com angeben",
  },
  twitch: {
    label: "Twitch",
    placeholder: "twitch.tv/…",
    hint: "einen Link zu eurem Kanal auf twitch.tv angeben",
  },
  youtube: {
    label: "YouTube",
    placeholder: "youtube.com/@…",
    hint: "einen Link zu eurem Kanal auf youtube.com angeben",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "tiktok.com/@…",
    hint: "einen Link zu eurem Profil auf tiktok.com angeben (tiktok.com/@…)",
  },
};

export const TEAM_LINK_TEXTS = dictionary(de, {
  discord: {
    label: "Discord server",
    placeholder: "discord.gg/…",
    hint: "enter an invite link to your server (discord.gg/… or discord.com/invite/…)",
  },
  website: {
    label: "Website",
    placeholder: "your-site.com",
    hint: "enter an address with a domain, e.g. your-site.com",
  },
  x: {
    label: "X",
    placeholder: "x.com/…",
    hint: "enter a link to your profile on x.com or twitter.com",
  },
  instagram: {
    label: "Instagram",
    placeholder: "instagram.com/…",
    hint: "enter a link to your profile on instagram.com",
  },
  twitch: {
    label: "Twitch",
    placeholder: "twitch.tv/…",
    hint: "enter a link to your channel on twitch.tv",
  },
  youtube: {
    label: "YouTube",
    placeholder: "youtube.com/@…",
    hint: "enter a link to your channel on youtube.com",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "tiktok.com/@…",
    hint: "enter a link to your profile on tiktok.com (tiktok.com/@…)",
  },
});
