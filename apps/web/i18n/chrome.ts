// Texts of the frame around every page (§5.21): layout, header, footer, and of the shared server
// components used on many pages.
// Sentences with a link return the parts as an array, as this file has no JSX: the component passes
// the link with a key.
import { dictionary } from "@uni-scrims/core/config/locale";
import type { ReactNode } from "react";

export const layoutMessages = dictionary(
  { description: "Scrims für Valorant-Teams deutscher Hochschulen" },
  { description: "Scrims for Valorant teams of German universities" },
);

export const headerMessages = dictionary(
  {
    /** Next to the logo on the admin host (§5.13). */
    admin: "Admin",
    /** From the admin host to the main host. */
    toSite: "Zur Seite",
    /** Signed out, only on the landing page. */
    signIn: "Anmelden",
  },
  {
    admin: "Admin",
    toSite: "Go to site",
    signIn: "Sign in",
  },
);

export const footerMessages = dictionary(
  {
    impressum: "Impressum",
    privacy: "Datenschutz",
    support: "Support",
  },
  {
    impressum: "Legal notice",
    privacy: "Privacy",
    support: "Support",
  },
);

/** The banner while DMs or joining the hub failed, and the fix on the account page (§5.1). */
export const discordWarningMessages = dictionary(
  {
    bannerTitle: "Wir konnten dir keine Discord-Nachricht schicken",
    bannerText:
      "Ohne Direktnachrichten verpasst du Benachrichtigungen, etwa zu Bewerbungen und Scrims.",
    bannerLink: "So behebst du das",
    title: "Discord-Nachrichten kommen nicht an",
    /** With the hub's invite link, if there is one. */
    joinHub: (invite: ReactNode): ReactNode[] => [
      "Tritt dem Uni-Scrims-Server bei",
      ...(invite ? [": ", invite] : []),
      ". Erlaube dort in den Privatsphäre-Einstellungen „Direktnachrichten von Servermitgliedern“.",
    ],
    allowDms:
      "Öffne in Discord die Privatsphäre-Einstellungen des Uni-Scrims-Servers und erlaube „Direktnachrichten von Servermitgliedern“.",
  },
  {
    bannerTitle: "We couldn't send you a Discord message",
    bannerText:
      "Without direct messages you'll miss notifications, for example about applications and scrims.",
    bannerLink: "How to fix this",
    title: "Discord messages aren't getting through",
    joinHub: (invite) => [
      "Join the Uni Scrims server",
      ...(invite ? [": ", invite] : []),
      ". There, allow “Direct messages from server members” in the privacy settings.",
    ],
    allowDms:
      "In Discord, open the privacy settings of the Uni Scrims server and allow “Direct messages from server members”.",
  },
);

/** The opponent's captain after booking (SPEC P0-6). */
export const discordContactMessages = dictionary(
  {
    title: "Lobby auf Discord klären",
    contact: "Ansprechpartner:",
    captainOf: (team: string) => `Captain von ${team}`,
    message: "Auf Discord schreiben",
  },
  {
    title: "Sort out the lobby on Discord",
    contact: "Contact:",
    captainOf: (team) => `Captain of ${team}`,
    message: "Message on Discord",
  },
);

export const rankMessages = dictionary({ unranked: "Ohne Rang" }, { unranked: "Unranked" });

/** A scrim or request of another own team (SPEC N-17). */
export const switchTeamMessages = dictionary(
  { switchTo: (team: string) => `Zu ${team} wechseln` },
  { switchTo: (team) => `Switch to ${team}` },
);
