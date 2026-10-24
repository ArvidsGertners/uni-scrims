// Team lifecycle (SPEC P0-3, ARCHITECTURE §5.5). All paths ignore dissolved teams.
import { randomBytes } from "node:crypto";
import { AppStatus, type MemberRole, RequestStatus, ScrimStatus, prisma } from "@uni-scrims/db";
import { type Db, isUniqueViolation } from "./db.ts";
import { DomainError, problemError } from "./errors.ts";
import { inTransaction, lockRequest, lockScrim, lockTeam, lockUser } from "./locks.ts";
import {
  captainProblem,
  findOwnTeam,
  isCaptainOf,
  requireActiveAccountUser,
  requireCaptain,
  requireOwnCaptain,
  requireUser,
} from "./permissions.ts";
import { countReadyMembers, isReadyCount, isTeamActive, isVerifiedMember } from "./readiness.ts";
import { closeOpenRequest, openRequestWhere } from "./requests.ts";
import { type TeamInput, memberRoleSchema, parseInput, teamInputSchema } from "./schemas.ts";
import { cancelScheduledScrim } from "./scrims.ts";
import { clearTeamLogo, loadTeamLogoInfo, teamLogoInfo, teamLogoSelect } from "./team-logo.ts";
import { findUserByDiscordId } from "./users.ts";

export const MAX_TEAM_MEMBERS = 10;
/** Team cards show at most this many universities, then "+n" (SPEC P0-3). */
export const MAX_SHOWN_UNIVERSITIES = 3;

/** Case-insensitive uniqueness via Team.nameNormalized. */
export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase();
}

/** 12 URL-safe characters from 9 cryptographically random bytes. */
export function generateInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

/** A captain can only leave or delete the account as the last member (SPEC P0-3, P0-10). */
export const TRANSFER_CAPTAIN_FIRST = "Übertrage zuerst die Captain-Rolle.";

function nameTaken(): DomainError {
  return new DomainError("CONFLICT", "Der Teamname ist schon vergeben.");
}

function alreadyInTeam(): DomainError {
  return new DomainError("CONFLICT", "Du bist schon in einem Team.");
}

export async function createTeam(input: TeamInput & { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const data = parseInput(teamInputSchema, input);
  if (await prisma.teamMember.findUnique({ where: { userId: user.id } })) {
    throw alreadyInTeam();
  }
  try {
    return await prisma.$transaction(async (tx) => {
      // Nobody sees the new team yet, so the user row is the first lock (§4). A ban or deletion that
      // holds it finishes first and is seen here; a later one sees the membership and asks to retry.
      await lockUser(tx, user.id);
      await requireUser(user.id, tx);
      if (await tx.teamMember.findUnique({ where: { userId: user.id } })) {
        throw alreadyInTeam();
      }
      const team = await tx.team.create({
        data: {
          name: data.name,
          nameNormalized: normalizeTeamName(data.name),
          tag: data.tag,
          rank: data.rank,
          captainId: user.id,
          inviteCode: generateInviteCode(),
          createdAt: input.now,
        },
      });
      // The captain is always a member too.
      await tx.teamMember.create({
        data: { teamId: team.id, userId: user.id, joinedAt: input.now },
      });
      return team;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const taken = await prisma.team.findUnique({
      where: { nameNormalized: normalizeTeamName(data.name) },
    });
    throw taken ? nameTaken() : alreadyInTeam();
  }
}

export async function updateTeam(input: TeamInput & { userId: string; teamId: string }) {
  await requireCaptain(input.userId, input.teamId);
  const data = parseInput(teamInputSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      // Checked again under the team lock: a dissolution that commits meanwhile frees the name, and
      // writing it back onto the dissolved team would keep it taken for good.
      await lockTeam(tx, input.teamId);
      await requireCaptain(input.userId, input.teamId, tx);
      return tx.team.update({
        where: { id: input.teamId },
        data: {
          name: data.name,
          nameNormalized: normalizeTeamName(data.name),
          tag: data.tag,
          rank: data.rank,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** New invite code; the old link stops working. */
export async function regenerateInvite(input: { userId: string; teamId: string }) {
  await requireCaptain(input.userId, input.teamId);
  return prisma.$transaction(async (tx) => {
    // As in updateTeam: a dissolved team keeps no invite code.
    await lockTeam(tx, input.teamId);
    await requireCaptain(input.userId, input.teamId, tx);
    const team = await tx.team.update({
      where: { id: input.teamId },
      data: { inviteCode: generateInviteCode() },
    });
    return team.inviteCode;
  });
}

/**
 * /setup (ARCHITECTURE §6.4): links a Discord server and channel to the caller's team, so bookings,
 * cancellations and reminders are also posted there. Only the captain of a team that is not banned,
 * and not on the hub server: the bot can post there, and every team would post in public.
 */
export async function linkTeamChannel(
  input: { discordUserId: string; guildId: string; channelId: string },
  env: Record<string, string | undefined> = process.env,
) {
  if (input.guildId === env.HUB_GUILD_ID) {
    throw new DomainError(
      "INVALID",
      "Auf dem Uni-Scrims-Server geht das nicht. Nutze /setup auf eurem Team-Server.",
    );
  }
  const user = await findUserByDiscordId(input.discordUserId);
  const { team } = await requireOwnCaptain(user?.id);
  return prisma.$transaction(async (tx) => {
    // Checked again under the team lock: the role or the ban may have changed meanwhile.
    await lockTeam(tx, team.id);
    await requireCaptain(user?.id, team.id, tx);
    return tx.team.update({
      where: { id: team.id },
      data: { discordGuildId: input.guildId, discordChannelId: input.channelId },
      select: { id: true, name: true },
    });
  });
}

export async function transferCaptain(input: {
  userId: string;
  teamId: string;
  newCaptainId: string;
}): Promise<void> {
  await transferCaptainWith(requireCaptain, input);
}

/**
 * transferCaptain from the account page for an account that is not complete yet (§5.8): a captain
 * from before Phase 7 must hand over the role before deleting the account, without first giving a
 * name, an address and a password (SPEC N-3).
 */
export async function handOverCaptain(input: { userId: string; newCaptainId: string }) {
  const user = await requireActiveAccountUser(input.userId);
  const team = await findOwnTeam(user.id);
  if (!team) throw new DomainError("NOT_FOUND", "Du bist in keinem Team.");
  await transferCaptainWith(requireAccountCaptain, { ...input, teamId: team.id });
}

/** Captain of the own team (not banned), checked like requireCaptain but for incomplete accounts. */
async function requireAccountCaptain(userId: string | null | undefined, teamId: string, db: Db) {
  const user = await requireActiveAccountUser(userId, db);
  const team = await findOwnTeam(user.id, db);
  if (!team || team.id !== teamId) {
    throw new DomainError("FORBIDDEN", "Du bist nicht in diesem Team.");
  }
  const problem = captainProblem(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}

async function transferCaptainWith(
  check: (userId: string, teamId: string, db: Db) => Promise<{ user: { id: string } }>,
  input: { userId: string; teamId: string; newCaptainId: string },
): Promise<void> {
  // Checked without a lock first, so nobody but the captain can hold the team row.
  await check(input.userId, input.teamId, prisma);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const { user } = await check(input.userId, input.teamId, tx);
    if (input.newCaptainId === user.id) {
      throw new DomainError("INVALID", "Du bist schon Captain.");
    }
    const member = await tx.teamMember.findUnique({ where: { userId: input.newCaptainId } });
    if (member?.teamId !== input.teamId) {
      throw new DomainError("INVALID", "Nur Mitglieder können Captain werden.");
    }
    await tx.team.update({ where: { id: input.teamId }, data: { captainId: input.newCaptainId } });
  });
}

export async function removeMember(input: {
  userId: string;
  teamId: string;
  memberId: string;
}): Promise<void> {
  // As in transferCaptain: only the captain gets as far as the lock.
  await requireCaptain(input.userId, input.teamId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const { user } = await requireCaptain(input.userId, input.teamId, tx);
    if (input.memberId === user.id) {
      throw new DomainError("INVALID", "Du kannst dich nicht selbst entfernen.");
    }
    const removed = await tx.teamMember.deleteMany({
      where: { teamId: input.teamId, userId: input.memberId },
    });
    if (removed.count === 0) {
      throw new DomainError("NOT_FOUND", "Mitglied nicht gefunden.");
    }
  });
}

/**
 * Player, substitute or coach (SPEC N-1); only the first two count for readiness. The captain sets it
 * for every member, the own role included; verification is not needed, as for all team management.
 */
export async function setMemberRole(input: {
  userId: string;
  teamId: string;
  memberId: string;
  role: MemberRole;
}): Promise<void> {
  // As in removeMember: only the captain gets as far as the lock, and is checked again under it.
  await requireCaptain(input.userId, input.teamId);
  const role = parseInput(memberRoleSchema, input.role);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    await requireCaptain(input.userId, input.teamId, tx);
    const updated = await tx.teamMember.updateMany({
      where: { teamId: input.teamId, userId: input.memberId },
      data: { role },
    });
    if (updated.count === 0) {
      throw new DomainError("NOT_FOUND", "Mitglied nicht gefunden.");
    }
  });
}

/** Join via invite code of an active team; max. 10 members, at most one team per user. */
export async function joinTeam(input: { userId: string; inviteCode: string; now: Date }) {
  const user = await requireUser(input.userId);
  try {
    return await prisma.$transaction(async (tx) => {
      const found = await tx.team.findUnique({ where: { inviteCode: input.inviteCode } });
      if (!found) throw invalidInvite();
      // Lock first, then re-check: parallel joins must not exceed the member limit.
      await lockTeam(tx, found.id);
      const team = await tx.team.findUniqueOrThrow({ where: { id: found.id } });
      if (team.inviteCode !== input.inviteCode || !isTeamActive(team)) {
        throw invalidInvite();
      }
      // Team before user (§4), as in banUser and deleteAccount: a ban or deletion that holds the user
      // row finishes first and is seen here; a later one sees the membership and asks to retry.
      await lockUser(tx, user.id);
      await requireUser(user.id, tx);
      const membership = await tx.teamMember.findUnique({ where: { userId: user.id } });
      if (membership) {
        throw membership.teamId === team.id
          ? new DomainError("CONFLICT", "Du bist schon in diesem Team.")
          : alreadyInTeam();
      }
      if ((await tx.teamMember.count({ where: { teamId: team.id } })) >= MAX_TEAM_MEMBERS) {
        throw new DomainError(
          "CONFLICT",
          `Das Team ist voll (max. ${MAX_TEAM_MEMBERS} Mitglieder).`,
        );
      }
      await tx.teamMember.create({
        data: { teamId: team.id, userId: user.id, joinedAt: input.now },
      });
      return team;
    });
  } catch (error) {
    // Parallel joins of the same user to two teams hit TeamMember.userId unique.
    if (isUniqueViolation(error)) throw alreadyInTeam();
    throw error;
  }
}

function invalidInvite(): DomainError {
  return new DomainError("NOT_FOUND", "Dieser Einladungslink ist ungültig.");
}

/**
 * Players can always leave, also banned teams. The captain only as the last member,
 * which dissolves the team.
 */
export async function leaveTeam(input: { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  if (!ownTeam) {
    throw new DomainError("NOT_FOUND", "Du bist in keinem Team.");
  }
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, ownTeam.id);
    const team = await tx.team.findUniqueOrThrow({ where: { id: ownTeam.id } });
    if (!isCaptainOf(user, team)) {
      await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
      return { dissolved: false };
    }
    if ((await tx.teamMember.count({ where: { teamId: team.id } })) > 1) {
      throw new DomainError("CONFLICT", TRANSFER_CAPTAIN_FIRST);
    }
    await dissolveTeam(team.id, input.now, tx);
    return { dissolved: true };
  });
}

/**
 * Internal building block without permission check (callers: leaveTeam, deleteAccount).
 * No hard delete: scrims keep the team ID. Name and invite link become free/invalid, the logo goes.
 */
export async function dissolveTeam(teamId: string, now: Date, db: Db = prisma): Promise<void> {
  await inTransaction(db, async (tx) => {
    await retireTeamActivity(teamId, now, tx);
    await tx.teamMember.deleteMany({ where: { teamId } });
    await clearTeamLogo(tx, teamId);
    await tx.team.update({
      where: { id: teamId },
      data: { dissolvedAt: now, nameNormalized: null, inviteCode: null },
    });
  });
}

/**
 * The requests retireTeamActivity locks, sorted by id: the team's open requests and the open
 * requests its pending applications go to. A caller that locks further requests before the
 * retirement (deleteAccount) locks these together with its own, so every request lock of the
 * transaction is taken in id order (§4).
 */
export async function retirementRequestIds(
  teamId: string,
  now: Date,
  db: Db = prisma,
): Promise<string[]> {
  const own = await db.scrimRequest.findMany({
    where: { teamId, ...openRequestWhere(now) },
    select: { id: true },
  });
  const applied = await db.application.findMany({
    where: { teamId, status: AppStatus.PENDING, request: openRequestWhere(now) },
    select: { requestId: true },
  });
  return [
    ...new Set([...own.map(({ id }) => id), ...applied.map(({ requestId }) => requestId)]),
  ].sort();
}

/**
 * On ban and dissolution (ARCHITECTURE §5.5): open requests are cancelled, own applications to open
 * requests withdrawn and future scrims cancelled. These cancellations never count as late. Requests
 * that have started are no longer open: the sweeper lets them expire (§6.3), with their applications.
 * The caller holds the team lock.
 */
export async function retireTeamActivity(teamId: string, now: Date, db: Db = prisma) {
  await inTransaction(db, async (tx) => {
    // Lock order (§4): all requests in id order, then the scrims, and only then applications and
    // notifications. Two teams that applied to each other's requests and are retired at the same
    // time would otherwise lock the same two applications in opposite order.
    const requestIds = await retirementRequestIds(teamId, now, tx);
    for (const id of requestIds) await lockRequest(tx, id);
    const scrims = await tx.scrim.findMany({
      where: {
        status: ScrimStatus.SCHEDULED,
        startsAt: { gt: now },
        OR: [{ hostTeamId: teamId }, { guestTeamId: teamId }],
      },
      orderBy: { id: "asc" },
      include: { hostTeam: { select: { name: true } }, guestTeam: { select: { name: true } } },
    });
    for (const scrim of scrims) await lockScrim(tx, scrim.id);

    const requests = await tx.scrimRequest.findMany({
      where: { id: { in: requestIds }, teamId },
      orderBy: { id: "asc" },
      include: { team: { select: { name: true } } },
    });
    for (const request of requests) {
      await closeOpenRequest(tx, request, RequestStatus.CANCELLED, now);
    }
    await tx.application.updateMany({
      where: { teamId, status: AppStatus.PENDING, requestId: { in: requestIds } },
      data: { status: AppStatus.WITHDRAWN, decidedAt: now },
    });
    for (const scrim of scrims) {
      await cancelScheduledScrim(tx, scrim, teamId, false, now);
    }
  });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** Distinct universities, at most MAX_SHOWN_UNIVERSITIES, the rest as a count. */
export function summarizeUniversities(names: (string | null)[]) {
  const distinct = [...new Set(names.filter((name): name is string => !!name))].sort((a, b) =>
    a.localeCompare(b, "de"),
  );
  return {
    shown: distinct.slice(0, MAX_SHOWN_UNIVERSITIES),
    more: Math.max(0, distinct.length - MAX_SHOWN_UNIVERSITIES),
  };
}

type MemberUniversity = {
  user: {
    verifiedAt: Date | null;
    universityOther: string | null;
    university: { name: string } | null;
  };
};

/** Universities represented on a team card: those of the verified members (SPEC P0-3). */
export function teamUniversities(members: MemberUniversity[]) {
  return summarizeUniversities(
    members
      .filter(({ user }) => isVerifiedMember(user))
      .map(({ user }) => user.university?.name ?? user.universityOther),
  );
}

const memberSelect = {
  joinedAt: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      image: true,
      verifiedAt: true,
      universityOther: true,
      university: { select: { name: true } },
      pendingVerification: { select: { id: true } },
    },
  },
} as const;

/** Own team for the team page; null if the user is in no team. */
export async function getMyTeam(userId: string) {
  const user = await requireUser(userId);
  const team = await findOwnTeam(user.id);
  if (!team) return null;
  const [memberRows, logo] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId: team.id },
      select: memberSelect,
      orderBy: { joinedAt: "asc" },
    }),
    loadTeamLogoInfo(team),
  ]);

  const isCaptain = isCaptainOf(user, team);
  const members = memberRows.map(({ user: member, joinedAt, role }) => ({
    id: member.id,
    name: member.name,
    image: member.image,
    joinedAt,
    role,
    isCaptain: isCaptainOf(member, team),
    status: isVerifiedMember(member)
      ? ("VERIFIED" as const)
      : member.pendingVerification
        ? ("PENDING" as const)
        : ("UNVERIFIED" as const),
  }));
  // Verified players and substitutes; coaches never count (SPEC N-1).
  const verifiedPlayerCount = countReadyMembers(memberRows);
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: team.rank,
    logo,
    banned: team.bannedAt !== null,
    isCaptain,
    // Only the captain manages the invite link.
    inviteCode: isCaptain ? team.inviteCode : null,
    members,
    verifiedPlayerCount,
    // Counted once, judged by the rule core enforces, so the team page and the request pages agree.
    ready: isReadyCount(verifiedPlayerCount),
    universities: teamUniversities(memberRows),
  };
}

/**
 * Preview on the invite page for logged-in, non-banned users (§7: team cards);
 * null for unknown codes and banned or dissolved teams.
 */
export async function getTeamByInviteCode(userId: string, inviteCode: string) {
  await requireUser(userId);
  const team = await prisma.team.findUnique({
    where: { inviteCode },
    include: { members: { select: memberSelect }, logos: teamLogoSelect.logos },
  });
  if (!team || !isTeamActive(team)) return null;
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: team.rank,
    logo: teamLogoInfo(team),
    memberCount: team.members.length,
    full: team.members.length >= MAX_TEAM_MEMBERS,
    universities: teamUniversities(team.members),
  };
}
