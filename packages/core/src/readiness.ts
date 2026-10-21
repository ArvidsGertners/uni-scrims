// Whether a team can play: active, and ready with enough verified members (SPEC P0-3).
// Every count of verified members and every readiness decision goes through these rules.
import { type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

/** A team is ready to play with at least this many verified members (SPEC P0-3). */
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

/** The readiness rule on a number of verified members. */
export function isReadyCount(verifiedCount: number): boolean {
  return verifiedCount >= READY_MEMBER_COUNT;
}

/** isVerifiedMember as a database count. */
export async function countVerifiedMembers(teamId: string, db: Db = prisma): Promise<number> {
  return db.teamMember.count({ where: { teamId, user: { verifiedAt: { not: null } } } });
}

export async function isTeamReady(teamId: string, db: Db = prisma): Promise<boolean> {
  return isReadyCount(await countVerifiedMembers(teamId, db));
}

/** isTeamReady for members that are already loaded. */
export function hasReadyMembers(
  members: readonly { user: { verifiedAt: Date | null } }[],
): boolean {
  return isReadyCount(members.filter(({ user }) => isVerifiedMember(user)).length);
}
