import { prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

/** A team is ready to play with at least this many verified members (SPEC P0-3). */
export const READY_MEMBER_COUNT = 5;

export async function countVerifiedMembers(teamId: string, db: Db = prisma): Promise<number> {
  return db.teamMember.count({ where: { teamId, user: { verifiedAt: { not: null } } } });
}

export async function isTeamReady(teamId: string, db: Db = prisma): Promise<boolean> {
  return (await countVerifiedMembers(teamId, db)) >= READY_MEMBER_COUNT;
}
