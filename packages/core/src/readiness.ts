// Whether a team can play: active, and ready with enough verified players (SPEC P0-3, N-1).
// Every count of verified players and every readiness decision goes through these rules.
import { MemberRole, type Prisma, prisma } from "@uni-scrims/db";
import { READY_MEMBER_COUNT } from "../config/limits.ts";
import type { Db } from "./db.ts";

export { READY_MEMBER_COUNT };

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
 * A verified member: member status and the universities of the team card. Readiness counts only
 * verified players and substitutes, see countsForReadiness.
 */
export function isVerifiedMember(user: { verifiedAt: Date | null }): boolean {
  return user.verifiedAt !== null;
}

/**
 * Roles that play and so count for readiness and, since Phase 20, for the team rank; coaches never
 * do, verified or not (SPEC N-1, N-16).
 */
const PLAYING_ROLES: readonly MemberRole[] = [MemberRole.PLAYER, MemberRole.SUBSTITUTE];

export function isPlayingRole(role: MemberRole): boolean {
  return PLAYING_ROLES.includes(role);
}

/** A member counts for readiness: verified and not a coach. */
export function countsForReadiness(member: {
  role: MemberRole;
  user: { verifiedAt: Date | null };
}): boolean {
  return isVerifiedMember(member.user) && isPlayingRole(member.role);
}

/** The readiness rule on a number of members that count for it. */
export function isReadyCount(verifiedCount: number): boolean {
  return verifiedCount >= READY_MEMBER_COUNT;
}

/** countsForReadiness as a database count. */
export async function countVerifiedPlayers(teamId: string, db: Db = prisma): Promise<number> {
  return db.teamMember.count({
    where: { teamId, role: { in: [...PLAYING_ROLES] }, user: { verifiedAt: { not: null } } },
  });
}

export async function isTeamReady(teamId: string, db: Db = prisma): Promise<boolean> {
  return isReadyCount(await countVerifiedPlayers(teamId, db));
}

type LoadedMember = { role: MemberRole; user: { verifiedAt: Date | null } };

/** countVerifiedPlayers for members that are already loaded. */
export function countReadyMembers(members: readonly LoadedMember[]): number {
  return members.filter(countsForReadiness).length;
}

/** isTeamReady for members that are already loaded. */
export function hasReadyMembers(members: readonly LoadedMember[]): boolean {
  return isReadyCount(countReadyMembers(members));
}
