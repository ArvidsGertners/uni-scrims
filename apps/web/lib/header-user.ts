import { getNavTeam } from "@uni-scrims/core";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { getSignedInUser } from "./session.ts";

/** The signed-in user for the header, or null; also null if the database is down, so legal pages still render. */
export async function headerUser() {
  try {
    return await getSignedInUser();
  } catch (error) {
    // Next signals dynamic rendering and redirects by throwing; those must pass.
    unstable_rethrow(error);
    console.error("Could not load the user for the header", error);
    return null;
  }
}

/**
 * Signed-in user and own team for header, sidebar and footer (§5.15), once per request. The team
 * only for active accounts, which see the full navigation; a failing database shows the site as
 * logged out, like headerUser.
 */
export const siteChrome = cache(async () => {
  const user = await headerUser();
  const active = user !== null && !user.bannedAt && !user.setupStep;
  let team: Awaited<ReturnType<typeof getNavTeam>> = null;
  if (user && active) {
    try {
      team = await getNavTeam(user.id);
    } catch (error) {
      unstable_rethrow(error);
      console.error("Could not load the team for the sidebar", error);
    }
  }
  return { user, active, team };
});
