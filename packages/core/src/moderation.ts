// Bans by admins (SPEC P0-9, edge cases; ARCHITECTURE §5.5). Unbanning is manual SQL in the MVP.
import { type Prisma, prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeam } from "./locks.ts";
import { findOwnTeam, isCaptainOf, requireAdmin } from "./permissions.ts";
import { retireTeamActivity } from "./teams.ts";
import { DISCORD_PROVIDER } from "./users.ts";

export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_RESULTS = 20;

/**
 * Admin search for the ban page: users by part of their Discord name or by exact Discord ID, teams
 * by part of their name. Only users with a Discord account, so deleted accounts that are not banned
 * do not show up; dissolved teams neither.
 */
export async function searchModerationTargets(input: { adminId: string; query: string }) {
  await requireAdmin(input.adminId);
  const query = input.query.trim();
  if (query.length < MIN_SEARCH_LENGTH) return { users: [], teams: [] };

  const discordAccount = { providerId: DISCORD_PROVIDER };
  const users = await prisma.user.findMany({
    where: {
      accounts: { some: discordAccount },
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { accounts: { some: { ...discordAccount, accountId: query } } },
      ],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_SEARCH_RESULTS,
    select: {
      id: true,
      name: true,
      image: true,
      bannedAt: true,
      accounts: { where: discordAccount, select: { accountId: true } },
      membership: {
        select: { team: { select: { id: true, name: true, captainId: true, dissolvedAt: true } } },
      },
    },
  });
  const teams = await prisma.team.findMany({
    where: { dissolvedAt: null, name: { contains: query, mode: "insensitive" } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_SEARCH_RESULTS,
    select: {
      id: true,
      name: true,
      tag: true,
      bannedAt: true,
      captain: { select: { name: true } },
      _count: { select: { members: true } },
    },
  });

  return {
    users: users.map((user) => {
      const team = user.membership?.team;
      return {
        id: user.id,
        name: user.name,
        image: user.image,
        discordId: user.accounts[0]?.accountId ?? null,
        banned: user.bannedAt !== null,
        team:
          team && !team.dissolvedAt
            ? { id: team.id, name: team.name, isCaptain: isCaptainOf(user, team) }
            : null,
      };
    }),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      banned: team.bannedAt !== null,
      captainName: team.captain.name,
      memberCount: team._count.members,
    })),
  };
}

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
