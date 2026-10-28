import { countUnread, getNavTeam, userDisplayName } from "@uni-scrims/core";
import { WHATS_NEW_EDITION } from "@uni-scrims/core/config/whats-new";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { AppNavData } from "@/components/app-nav";
import { adminUrl, isAdminHost } from "./admin-url.ts";
import { getLocale } from "./locale.ts";
import { getSignedInUser } from "./session.ts";

/**
 * The signed-in user for the header and the language (§5.21), or null, once per request; also null
 * if the database is down, so legal pages still render.
 */
export const headerUser = cache(async () => {
  try {
    return await getSignedInUser();
  } catch (error) {
    // Next signals dynamic rendering and redirects by throwing; those must pass.
    unstable_rethrow(error);
    console.error("Could not load the user for the header", error);
    return null;
  }
});

/**
 * Signed-in user, own team and host for header, sidebar and footer (§5.15), once per request. The
 * team only for active accounts on the main host, which see the full navigation; a failing
 * database shows the site as logged out (like headerUser), a failing team query a neutral entry.
 */
export const siteChrome = cache(async () => {
  const user = await headerUser();
  const adminHost = isAdminHost((await headers()).get("host"));
  const active = user !== null && !user.bannedAt && !user.setupStep;
  let teams: Awaited<ReturnType<typeof getNavTeam>> | null = null;
  let teamUnavailable = false;
  if (user && active && !adminHost) {
    try {
      teams = await getNavTeam(user.id);
    } catch (error) {
      unstable_rethrow(error);
      console.error("Could not load the team for the sidebar", error);
      teamUnavailable = true;
    }
  }
  return { user, active, teams, teamUnavailable, adminHost };
});

/**
 * The warning dot at the verification tab: unverified captain of an active team (SPEC N-21), from
 * the sidebar's team query, so the tab and the sidebar agree.
 */
export async function verificationNeeded(): Promise<boolean> {
  return (await siteChrome()).teams?.verificationNeeded ?? false;
}

/**
 * The what's new dialog opens by itself (SPEC N-29, §5.31): an active account on the main host that
 * has not closed the current edition.
 */
export async function whatsNewDue(): Promise<boolean> {
  // The same gating as the full navigation: no nav on the admin host, `full` only when active.
  const [nav, { user }] = await Promise.all([siteNav(), siteChrome()]);
  return nav?.full === true && user?.whatsNewSeen !== WHATS_NEW_EDITION;
}

/** The navigation of the signed-in user, or null (logged out, admin host), once per request. */
export const siteNav = cache(async (): Promise<AppNavData | null> => {
  const { user, active, teams, teamUnavailable, adminHost } = await siteChrome();
  if (!user || adminHost) return null;
  const locale = await getLocale();
  return {
    full: active,
    account: {
      id: user.id,
      // "Neues Konto" until Discord is linked, shown in the page's language (§5.21).
      name: userDisplayName(user.name, locale),
      avatarVersion: user.avatarVersion,
      // Only unverified captains of an active team need it for scrims (SPEC N-21).
      unverified: active && (teams?.verificationNeeded ?? false),
    },
    team: teams?.team ?? null,
    teams: teams?.teams ?? [],
    canAddTeam: teams !== null && teams.limitProblem === null,
    teamUnavailable,
    // Like the former box on the account page: staff with an active account (§5.16).
    adminUrl: active && user.staffRole ? adminUrl("/") : null,
  };
});

/**
 * The unread count the bell starts with (SPEC N-32, §5.34), or null without a bell: only with the
 * full navigation (an active account on the main host). A failing query starts it at 0; the
 * WebSocket server sends the real count right after.
 */
export async function inboxUnread(): Promise<number | null> {
  const [nav, { user }] = await Promise.all([siteNav(), siteChrome()]);
  if (nav?.full !== true || !user) return null;
  try {
    return await countUnread(user.id);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Could not count the bell's entries", error);
    return 0;
  }
}
