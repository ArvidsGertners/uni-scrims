import { getNavTeam } from "@uni-scrims/core";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { AppNavData } from "@/components/app-nav";
import { adminUrl, isAdminHost } from "./admin-url.ts";
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

/** The navigation of the signed-in user, or null (logged out, admin host). */
export async function siteNav(): Promise<AppNavData | null> {
  const { user, active, teams, teamUnavailable, adminHost } = await siteChrome();
  if (!user || adminHost) return null;
  return {
    full: active,
    account: {
      id: user.id,
      name: user.name,
      avatarVersion: user.avatarVersion,
      unverified: active && !user.verifiedAt,
    },
    team: teams?.team ?? null,
    teams: teams?.teams ?? [],
    canAddTeam: teams !== null && teams.limitProblem === null,
    teamUnavailable,
    // Like the former box on the account page: staff with an active account (§5.16).
    adminUrl: active && user.staffRole ? adminUrl("/") : null,
  };
}
