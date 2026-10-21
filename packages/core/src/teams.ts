// Team lifecycle (SPEC P0-3, ARCHITECTURE §5.5). All paths ignore dissolved teams.
import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { DomainError } from "./errors.ts";
import { requireCaptain, requireUser } from "./permissions.ts";
import { READY_MEMBER_COUNT } from "./readiness.ts";
import { type TeamInput, teamInputSchema } from "./schemas.ts";

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

function parseTeamInput(input: TeamInput): TeamInput {
  const parsed = teamInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("INVALID", parsed.error.issues[0]?.message ?? "Ungültige Eingabe.");
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function nameTaken(): DomainError {
  return new DomainError("CONFLICT", "Der Teamname ist schon vergeben.");
}

function alreadyInTeam(): DomainError {
  return new DomainError("CONFLICT", "Du bist schon in einem Team.");
}

/** Row lock on the team (the only allowed raw SQL, ARCHITECTURE §4). */
async function lockTeam(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Team" WHERE id = ${teamId} FOR UPDATE`;
}

export async function createTeam(input: TeamInput & { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const data = parseTeamInput(input);
  if (await prisma.teamMember.findUnique({ where: { userId: user.id } })) {
    throw alreadyInTeam();
  }
  try {
    return await prisma.$transaction(async (tx) => {
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
  const data = parseTeamInput(input);
  try {
    return await prisma.team.update({
      where: { id: input.teamId },
      data: {
        name: data.name,
        nameNormalized: normalizeTeamName(data.name),
        tag: data.tag,
        rank: data.rank,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/** New invite code; the old link stops working. */
export async function regenerateInvite(input: { userId: string; teamId: string }) {
  await requireCaptain(input.userId, input.teamId);
  const team = await prisma.team.update({
    where: { id: input.teamId },
    data: { inviteCode: generateInviteCode() },
  });
  return team.inviteCode;
}

export async function transferCaptain(input: {
  userId: string;
  teamId: string;
  newCaptainId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const { user } = await requireCaptain(input.userId, input.teamId, tx);
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
      if (team.inviteCode !== input.inviteCode || team.dissolvedAt || team.bannedAt) {
        throw invalidInvite();
      }
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
  const membership = await prisma.teamMember.findUnique({ where: { userId: user.id } });
  if (!membership) {
    throw new DomainError("NOT_FOUND", "Du bist in keinem Team.");
  }
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, membership.teamId);
    const team = await tx.team.findUniqueOrThrow({ where: { id: membership.teamId } });
    if (team.captainId !== user.id) {
      await tx.teamMember.deleteMany({ where: { teamId: team.id, userId: user.id } });
      return { dissolved: false };
    }
    if ((await tx.teamMember.count({ where: { teamId: team.id } })) > 1) {
      throw new DomainError("CONFLICT", "Übertrage zuerst die Captain-Rolle.");
    }
    await dissolveTeam(team.id, input.now, tx);
    return { dissolved: true };
  });
}

/**
 * Internal building block without permission check (callers: leaveTeam, later deleteAccount).
 * No hard delete: scrims keep the team ID. Name and invite link become free/invalid.
 */
export async function dissolveTeam(teamId: string, now: Date, db: Db = prisma): Promise<void> {
  await retireTeamActivity(teamId, now, db);
  await db.teamMember.deleteMany({ where: { teamId } });
  await db.team.update({
    where: { id: teamId },
    data: { dissolvedAt: now, nameNormalized: null, inviteCode: null },
  });
}

/**
 * Cancels open requests, withdraws open applications and cancels future scrims of a team
 * (ARCHITECTURE §5.5). Stub in phase 1: requests and scrims arrive in phase 2.
 */
export async function retireTeamActivity(_teamId: string, _now: Date, _db: Db = prisma) {}

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

const memberSelect = {
  joinedAt: true,
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
  const membership = await prisma.teamMember.findUnique({
    where: { userId: user.id },
    select: {
      team: { include: { members: { select: memberSelect, orderBy: { joinedAt: "asc" } } } },
    },
  });
  const team = membership?.team;
  if (!team || team.dissolvedAt) return null;

  const isCaptain = team.captainId === user.id;
  const members = team.members.map(({ user: member, joinedAt }) => ({
    id: member.id,
    name: member.name,
    image: member.image,
    joinedAt,
    isCaptain: member.id === team.captainId,
    status: member.verifiedAt
      ? ("VERIFIED" as const)
      : member.pendingVerification
        ? ("PENDING" as const)
        : ("UNVERIFIED" as const),
  }));
  const verifiedCount = members.filter((member) => member.status === "VERIFIED").length;
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: team.rank,
    banned: team.bannedAt !== null,
    isCaptain,
    // Only the captain manages the invite link.
    inviteCode: isCaptain ? team.inviteCode : null,
    members,
    verifiedCount,
    ready: verifiedCount >= READY_MEMBER_COUNT,
    universities: summarizeUniversities(
      team.members
        .filter(({ user: member }) => member.verifiedAt)
        .map(({ user: member }) => member.university?.name ?? member.universityOther),
    ),
  };
}

/** Preview on the invite page; null for unknown codes and banned or dissolved teams. */
export async function getTeamByInviteCode(inviteCode: string) {
  const team = await prisma.team.findUnique({
    where: { inviteCode },
    include: { members: { select: memberSelect } },
  });
  if (!team || team.dissolvedAt || team.bannedAt) return null;
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: team.rank,
    memberCount: team.members.length,
    full: team.members.length >= MAX_TEAM_MEMBERS,
    universities: summarizeUniversities(
      team.members
        .filter(({ user }) => user.verifiedAt)
        .map(({ user }) => user.university?.name ?? user.universityOther),
    ),
  };
}
