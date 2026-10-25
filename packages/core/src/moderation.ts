// Bans by admins (SPEC P0-9, edge cases; ARCHITECTURE §5.5). Unbanning is manual SQL in the MVP.
import { type Prisma, VerifStatus, prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeam } from "./locks.ts";
import { findOwnTeams, isCaptainOf, requireAdmin } from "./permissions.ts";
import { linksVersion, teamLinksSelect, toTeamLinks } from "./team-links.ts";
import { clearTeamLogo, logoVersion, teamLogoInfo, teamLogoSelect } from "./team-logo.ts";
import { clearTeamLinks, lockRetirements, retireTeamActivity } from "./teams.ts";
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
        memberships: {
          where: { team: { dissolvedAt: null } },
          orderBy: { joinedAt: "asc" },
          select: { team: { select: { id: true, name: true, captainId: true } } },
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
        ...teamLogoSelect,
        ...teamLinksSelect,
        linksUpdatedAt: true,
        captain: { select: { name: true } },
        _count: { select: { members: true } },
      },
    }),
  ]);

  return {
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      image: user.image,
      discordId: user.accounts[0]?.accountId ?? null,
      banned: user.bannedAt !== null,
      // All teams since Phase 21 (§5.20).
      teams: user.memberships.map(({ team }) => ({
        id: team.id,
        name: team.name,
        isCaptain: isCaptainOf(user, team),
      })),
    })),
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      logo: teamLogoInfo(team),
      links: toTeamLinks(team),
      linksVersion: linksVersion(team),
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
 * Moderation of logos (SPEC N-6, N-7): removes both logos, also of banned teams; a dissolved team
 * has none left. Only the state the admin looked at (`logoVersion`), not a logo the captain
 * uploaded in the meantime.
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

/**
 * Moderation of external links (SPEC N-15): removes all links of a team, also of a banned one; a
 * dissolved team has none left. Only the state the admin looked at (`linksVersion`).
 */
export async function removeTeamLinksAsAdmin(input: {
  adminId: string;
  teamId: string;
  linksVersion: number;
}) {
  await requireAdmin(input.adminId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      select: { dissolvedAt: true, linksUpdatedAt: true },
    });
    if (!team || team.dissolvedAt) throw new DomainError("NOT_FOUND", "Team nicht gefunden.");
    if (linksVersion(team) !== input.linksVersion) {
      throw new DomainError(
        "CONFLICT",
        "Die Links haben sich inzwischen geändert. Sieh sie dir erneut an.",
      );
    }
    await clearTeamLinks(tx, input.teamId);
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
 * and captain, and the team is banned with them; since Phase 21 for each of the user's teams. A
 * pending verification is closed without a message and its file deleted.
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
  // Teams before user, in id order, as in leaveTeam, joinTeam and deleteAccount (§4).
  const memberships = await tx.teamMember.findMany({
    where: { userId: user.id },
    orderBy: { teamId: "asc" },
    select: { teamId: true },
  });
  for (const { teamId } of memberships) await lockTeam(tx, teamId);
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

  // Read again under the lock: the user may have left or joined teams meanwhile.
  const locked = new Set(memberships.map(({ teamId }) => teamId));
  const teams = (await findOwnTeams(user.id, tx)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (teams.some((team) => !locked.has(team.id))) {
    // Joined another team in between; that one is not locked, and locking it now would invert
    // the order.
    throw new DomainError("CONFLICT", "Bitte versuch es erneut.");
  }
  // Every team the user captains is banned with them, the others lose the member (SPEC N-17). The
  // teams' requests and scrims before the verification rows (§4), all of them in id order.
  const captainOf = teams.filter((team) => isCaptainOf(user, team) && !team.bannedAt);
  await lockRetirements(
    tx,
    captainOf.map((team) => team.id),
    now,
  );
  let teamBanned = false;
  for (const team of teams) {
    if (isCaptainOf(user, team)) {
      teamBanned = (await banTeamInTx(tx, team.id, now)) || teamBanned;
    } else {
      await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
    }
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
