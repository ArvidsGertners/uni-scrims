import type { teamPageMessages } from "@/i18n/team";

type Texts = (typeof teamPageMessages)["de"];

/**
 * The landing page line of the team tab and the settings (SPEC N-34): the captain's consent, and why
 * a consenting team cannot appear. Whether it is among the shown teams depends on the others.
 */
export function landingStatus(
  team: { showOnLanding: boolean; landingEligible: boolean; banned: boolean },
  t: Texts,
): string {
  if (!team.showOnLanding) return t.landingNotAllowed;
  if (team.landingEligible) return t.landingAllowed;
  return team.banned ? t.landingBanned : t.landingWaitsForList;
}
