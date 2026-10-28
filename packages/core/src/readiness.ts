// Team rules: whether a team is active and whether it is fully verified, i.e. has enough verified
// players for the badge (SPEC N-1, N-21; until Phase 24 that was "ready to play" and required for
// scrims). Every count of verified players goes through these rules.
import { MemberRole, type Prisma, prisma } from "@uni-scrims/db";
import { FULLY_VERIFIED_PLAYER_COUNT } from "../config/limits.ts";
import type { Db } from "./db.ts";

export { FULLY_VERIFIED_PLAYER_COUNT };

/** Neither banned nor dissolved; only active teams can play or be joined (ARCHITECTURE §4). */
export function isTeamActive(team: { bannedAt: Date | null; dissolvedAt: Date | null }): boolean {
  return !team.bannedAt && !team.dissolvedAt;
}

/** isTeamActive as a Prisma filter. */
export function activeTeamWhere() {
  return { bannedAt: null, dissolvedAt: null } satisfies Prisma.TeamWhereInput;
}

/**
 * On the teams list (SPEC N-20): active and not hidden by the captain. A ban leaves `listed` as it
 * is, so every reader goes through this rule rather than the column.
 */
export function isListedTeam(team: {
  bannedAt: Date | null;
  dissolvedAt: Date | null;
  listed: boolean;
}): boolean {
  return isTeamActive(team) && team.listed;
}

/** isListedTeam as a Prisma filter. */
export function listedTeamWhere() {
  return { ...activeTeamWhere(), listed: true } satisfies Prisma.TeamWhereInput;
}

/**
 * On the landing page (SPEC N-34, §5.36): on the teams list and the captain agreed. Hiding, a ban or
 * a dissolution leave `showOnLanding` as it is, so every reader goes through this rule.
 */
export function isShowcaseTeam(team: {
  bannedAt: Date | null;
  dissolvedAt: Date | null;
  listed: boolean;
  showOnLanding: boolean | null;
}): boolean {
  return isListedTeam(team) && team.showOnLanding === true;
}

/** isShowcaseTeam as a Prisma filter. */
export function showcaseTeamWhere() {
  return { ...listedTeamWhere(), showOnLanding: true } satisfies Prisma.TeamWhereInput;
}

/**
 * A verified member: member status and the universities of the team card. The badge counts only
 * verified players and substitutes, see countsForFullVerification.
 */
export function isVerifiedMember(user: { verifiedAt: Date | null }): boolean {
  return user.verifiedAt !== null;
}

/**
 * Roles that play and so count for the badge and, since Phase 20, for the team rank; coaches never
 * do, verified or not (SPEC N-1, N-16, N-21).
 */
const PLAYING_ROLES: readonly MemberRole[] = [MemberRole.PLAYER, MemberRole.SUBSTITUTE];

export function isPlayingRole(role: MemberRole): boolean {
  return PLAYING_ROLES.includes(role);
}

/** A member counts for the badge: verified and not a coach. */
export function countsForFullVerification(member: {
  role: MemberRole;
  user: { verifiedAt: Date | null };
}): boolean {
  return isVerifiedMember(member.user) && isPlayingRole(member.role);
}

/** The badge rule on a number of members that count for it. */
export function isFullyVerifiedCount(verifiedCount: number): boolean {
  return verifiedCount >= FULLY_VERIFIED_PLAYER_COUNT;
}

/** countsForFullVerification as a database count. */
export async function countVerifiedPlayers(teamId: string, db: Db = prisma): Promise<number> {
  return db.teamMember.count({
    where: { teamId, role: { in: [...PLAYING_ROLES] }, user: { verifiedAt: { not: null } } },
  });
}

export async function isTeamFullyVerified(teamId: string, db: Db = prisma): Promise<boolean> {
  return isFullyVerifiedCount(await countVerifiedPlayers(teamId, db));
}

type LoadedMember = { role: MemberRole; user: { verifiedAt: Date | null } };

/** countVerifiedPlayers for members that are already loaded. */
export function countVerifiedPlayerMembers(members: readonly LoadedMember[]): number {
  return members.filter(countsForFullVerification).length;
}

/** isTeamFullyVerified for members that are already loaded. */
export function hasFullyVerifiedMembers(members: readonly LoadedMember[]): boolean {
  return isFullyVerifiedCount(countVerifiedPlayerMembers(members));
}
