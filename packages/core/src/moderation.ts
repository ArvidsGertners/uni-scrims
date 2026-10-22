// Bans by admins (SPEC P0-9, edge cases; ARCHITECTURE §5.5). Unbanning is manual SQL in the MVP.
import { type Prisma, prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeam } from "./locks.ts";
import { findOwnTeam, isCaptainOf, requireAdmin } from "./permissions.ts";
import { retireTeamActivity } from "./teams.ts";

/**
 * Bans a team that is not dissolved: open requests, own applications and future scrims are retired.
 * Returns false if the team was already banned. Building block without permission check.
 */
async function banTeamInTx(
  tx: Prisma.TransactionClient,
  teamId: string,
  now: Date,
): Promise<boolean> {
  await lockTeam(tx, teamId);
  const team = await tx.team.findUnique({ where: { id: teamId } });
  if (!team || team.dissolvedAt) {
    throw new DomainError("NOT_FOUND", "Team nicht gefunden.");
  }
  if (team.bannedAt) return false;
  await tx.team.update({ where: { id: teamId }, data: { bannedAt: now } });
  await retireTeamActivity(teamId, now, tx);
  return true;
}

export async function banTeam(input: { adminId: string; teamId: string; now: Date }) {
  await requireAdmin(input.adminId);
  await prisma.$transaction(async (tx) => {
    if (!(await banTeamInTx(tx, input.teamId, input.now))) {
      throw new DomainError("CONFLICT", "Das Team ist schon gesperrt.");
    }
  });
}

/**
 * Bans a user and ends their sessions. A player is removed from the team; a captain stays member
 * and captain, and the team is banned with them.
 */
export async function banUser(input: { adminId: string; userId: string; now: Date }) {
  const admin = await requireAdmin(input.adminId);
  if (input.userId === admin.id) {
    throw new DomainError("INVALID", "Du kannst dich nicht selbst sperren.");
  }
  return prisma.$transaction(async (tx) => {
    // Team before user, in the same order as leaveTeam, so the two cannot deadlock.
    const membership = await tx.teamMember.findUnique({ where: { userId: input.userId } });
    if (membership) await lockTeam(tx, membership.teamId);
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
    if (user.bannedAt) throw new DomainError("CONFLICT", "Der Nutzer ist schon gesperrt.");
    await tx.user.update({ where: { id: user.id }, data: { bannedAt: input.now } });
    await tx.session.deleteMany({ where: { userId: user.id } });

    // Read again under the lock: the user may have left or changed teams meanwhile.
    const team = await findOwnTeam(user.id, tx);
    if (!team) return { teamBanned: false };
    if (isCaptainOf(user, team)) {
      return { teamBanned: await banTeamInTx(tx, team.id, input.now) };
    }
    await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
    return { teamBanned: false };
  });
}
