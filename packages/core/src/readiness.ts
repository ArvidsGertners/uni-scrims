// Whether a team can play: active, and ready with enough verified players (SPEC P0-3, N-1).
// Every count of verified players and every readiness decision goes through these rules.
import { MemberRole, type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

/** A team is ready to play with at least this many verified players (SPEC P0-3). */
export const READY_MEMBER_COUNT = 5;

/** Neither banned nor dissolved; only active teams can play or be joined (ARCHITECTURE §4). */
export function isTeamActive(team: { bannedAt: Date | null; dissolvedAt: Date | null }): boolean {
  return !team.bannedAt && !team.dissolvedAt;
}

/** isTeamActive as a Prisma filter. */
export function activeTeamWhere() {
  return { bannedAt: null, dissolvedAt: null } satisfies Prisma.TeamWhereInput;
}

/** A member counts as verified for readiness and the team card. */
export function isVerifiedMember(user: { verifiedAt: Date | null }): boolean {
  return user.verifiedAt !== null;
}

/** Roles that play and so count for readiness; coaches never do, verified or not (SPEC N-1). */
const PLAYING_ROLES: readonly MemberRole[] = [MemberRole.PLAYER, MemberRole.SUBSTITUTE];

/** A member counts for readiness: verified and not a coach. */
export function countsForReadiness(member: {
  role: MemberRole;
  user: { verifiedAt: Date | null };
}): boolean {
  return isVerifiedMember(member.user) && PLAYING_ROLES.includes(member.role);
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

/** isTeamReady for members that are already loaded. */
export function hasReadyMembers(
  members: readonly { role: MemberRole; user: { verifiedAt: Date | null } }[],
): boolean {
  return isReadyCount(members.filter(countsForReadiness).length);
}
