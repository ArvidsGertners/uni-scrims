// Bans by admins (SPEC P0-9, edge cases; ARCHITECTURE §5.5). Unbanning is manual SQL in the MVP.
import { type Prisma, VerifStatus, prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeam } from "./locks.ts";
import { findOwnTeam, isCaptainOf, requireAdmin } from "./permissions.ts";
import { clearTeamLogo, logoVersion } from "./team-logo.ts";
import { retireTeamActivity } from "./teams.ts";
import { DISCORD_PROVIDER, getDiscordId } from "./users.ts";
import { BAN_REJECT_REASON, removeFilesAfterCommit } from "./verification.ts";

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
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
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
          select: {
            team: { select: { id: true, name: true, captainId: true, dissolvedAt: true } },
          },
        },
      },
    }),
    prisma.team.findMany({
      where: { dissolvedAt: null, name: { contains: query, mode: "insensitive" } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: MAX_SEARCH_RESULTS,
      select: {
        id: true,
        name: true,
        tag: true,
        bannedAt: true,
        logoUpdatedAt: true,
        captain: { select: { name: true } },
        _count: { select: { members: true } },
      },
    }),
  ]);

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
      logoVersion: logoVersion(team),
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
export async function banTeamInTx(
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

/**
 * Moderation of logos (SPEC N-6): also for banned teams; a dissolved team has no logo left. Only
 * the logo the admin looked at (`logoVersion`), not one the captain uploaded in the meantime.
 */
export async function removeTeamLogoAsAdmin(input: {
  adminId: string;
  teamId: string;
  logoVersion: number;
}) {
  await requireAdmin(input.adminId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { dissolvedAt: true, logoUpdatedAt: true },
    });
    if (!team || team.dissolvedAt) throw new DomainError("NOT_FOUND", "Team nicht gefunden.");
    if (logoVersion(team) !== input.logoVersion) {
      throw new DomainError(
        "CONFLICT",
        "Das Logo hat sich inzwischen geändert. Sieh es dir erneut an.",
      );
    }
    await clearTeamLogo(tx, input.teamId);
  });
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
 * and captain, and the team is banned with them. A pending verification is closed without a message
 * and its file deleted.
 */
export async function banUser(input: {
  adminId: string;
  userId: string;
  uploadDir: string;
  now: Date;
}) {
  const admin = await requireAdmin(input.adminId);
  if (input.userId === admin.id) {
    throw new DomainError("INVALID", "Du kannst dich nicht selbst sperren.");
  }
  const { teamBanned, closedVerifications } = await prisma.$transaction((tx) =>
    banUserInTx(tx, input.userId, input.now),
  );
  await removeFilesAfterCommit(closedVerifications, input.uploadDir);
  return { teamBanned };
}

/** Building block of banUser without permission check (also used after a restore). */
export async function banUserInTx(tx: Prisma.TransactionClient, userId: string, now: Date) {
  const user = { id: userId };
  // Team before user, in the same order as leaveTeam, joinTeam and deleteAccount (§4).
  const membership = await tx.teamMember.findUnique({ where: { userId: user.id } });
  if (membership) await lockTeam(tx, membership.teamId);
  // The update locks the user row, so it waits for a running deleteAccount, joinTeam, createTeam or
  // submitVerification, and they wait for it.
  // Staff cannot be banned while they hold a role (§5.9): checked under the same row lock.
  const banned = await tx.user.updateMany({
    where: { id: user.id, bannedAt: null, staffRole: null },
    data: { bannedAt: now },
  });
  if (banned.count === 0) {
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
    throw current.bannedAt
      ? new DomainError("CONFLICT", "Der Nutzer ist schon gesperrt.")
      : new DomainError(
          "CONFLICT",
          "Der Nutzer hat eine Admin- oder Prüfer-Rolle. Entziehe sie zuerst.",
        );
  }
  // A deleted account has no Discord link left: a new login would create a new, unbanned user.
  if (!(await getDiscordId(user.id, tx))) {
    throw new DomainError("CONFLICT", "Das Konto wurde gelöscht, eine Sperre würde nicht greifen.");
  }

  // Read again under the lock: the user may have left or changed teams meanwhile.
  const team = await findOwnTeam(user.id, tx);
  if (team && team.id !== membership?.teamId) {
    // Joined another team in between; that one is not locked, and locking it now would invert
    // the order.
    throw new DomainError("CONFLICT", "Bitte versuch es erneut.");
  }
  // The team's requests and scrims before the verification rows (§4).
  let teamBanned = false;
  if (team && isCaptainOf(user, team)) {
    teamBanned = await banTeamInTx(tx, team.id, now);
  } else if (team) {
    await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
  }

  await tx.session.deleteMany({ where: { userId: user.id } });
  // After the user row is locked, so an upload that committed first is included. A cascade, not a
  // review of the document: no admin, no message.
  const closedVerifications = await tx.verificationRequest.updateManyAndReturn({
    where: { userId: user.id, status: VerifStatus.PENDING },
    data: {
      status: VerifStatus.REJECTED,
      rejectReason: BAN_REJECT_REASON,
      decidedAt: now,
      decidedById: null,
      pendingUserId: null,
    },
    select: { id: true, filePath: true },
  });
  return { teamBanned, closedVerifications };
}
