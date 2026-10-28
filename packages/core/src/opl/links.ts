// Linking accounts and teams with OPL (SPEC N-35, ARCHITECTURE §5.37). OPL is asked before every
// transaction, never inside one; the transaction locks and checks again. Discord IDs from OPL are
// compared in memory only; stored are the OPL IDs, the check times and the matches in the roster.
import { type Prisma, prisma } from "@uni-scrims/db";
import { type Db, isUniqueViolation } from "../db.ts";
import { DomainError } from "../errors.ts";
import { lockTeam, lockUser } from "../locks.ts";
import { requireCaptain, requireUser } from "../permissions.ts";
import { DISCORD_PROVIDER, getDiscordId } from "../users.ts";
import { type OplApi, OplError, type OplRosterMember, type OplResponse } from "./client.ts";
import { oplUserUrl, parseOplUrl } from "./url.ts";

const HOUR = 60 * 60 * 1000;
/** A link is checked again 20–28 h after the last check, spread over the day (SPEC N-35). */
export const OPL_RECHECK_MIN_HOURS = 20;
export const OPL_RECHECK_SPREAD_HOURS = 8;
/** OPL has to report a profile or team as deleted this many times in a row before the link goes. */
export const OPL_GONE_LIMIT = 3;

export type Random = () => number;

/** When to check a link next: now + 20 h + up to 8 h, so the calls spread over the day. */
export function nextOplCheck(now: Date, random: Random = Math.random): Date {
  const hours = OPL_RECHECK_MIN_HOURS + random() * OPL_RECHECK_SPREAD_HOURS;
  return new Date(now.getTime() + hours * HOUR);
}

/** The OPL columns of a user without a link. */
export const NO_USER_OPL = {
  oplUserId: null,
  oplLinkedAt: null,
  oplCheckedAt: null,
  oplNextCheckAt: null,
  oplFailures: 0,
} satisfies Prisma.UserUncheckedUpdateInput;

const NO_TEAM_OPL = {
  oplTeamId: null,
  oplLinkedAt: null,
  oplCheckedAt: null,
  oplNextCheckAt: null,
  oplFailures: 0,
  oplRosterOthers: null,
} satisfies Prisma.TeamUncheckedUpdateInput;

function unavailable(): DomainError {
  return new DomainError("CONFLICT", "oplUnavailable");
}

/** Calls OPL; a missing client (no key) or a failed call becomes "OPL can't be reached". */
async function callOpl<T>(
  opl: OplApi | null,
  call: (api: OplApi) => Promise<OplResponse<T>>,
): Promise<T> {
  if (!opl) throw unavailable();
  try {
    return (await call(opl)).result;
  } catch (error) {
    if (error instanceof OplError) throw unavailable();
    throw error;
  }
}

/**
 * The members of the team whose Discord ID stands in the OPL roster (SPEC N-35: members only), and
 * how many in the roster are no such match. Pure; the Discord IDs never leave this function.
 */
export function rosterMatches(
  roster: readonly OplRosterMember[],
  members: readonly { userId: string; discordId: string }[],
): { userIds: string[]; others: number } {
  const inRoster = new Set(roster.flatMap((entry) => (entry.discordId ? [entry.discordId] : [])));
  const userIds = members.filter((member) => inRoster.has(member.discordId)).map((m) => m.userId);
  return { userIds: userIds.sort(), others: Math.max(0, roster.length - userIds.length) };
}

/** The Discord IDs of the team's members, for rosterMatches. */
async function memberDiscordIds(db: Db, teamId: string) {
  const members = await db.teamMember.findMany({ where: { teamId }, select: { userId: true } });
  const accounts = await db.account.findMany({
    where: { providerId: DISCORD_PROVIDER, userId: { in: members.map(({ userId }) => userId) } },
    select: { userId: true, accountId: true },
  });
  return accounts.map(({ userId, accountId }) => ({ userId, discordId: accountId }));
}

/** Replaces the team's matches from a fresh roster; returns the number of the others. */
export async function writeRosterMatches(
  tx: Prisma.TransactionClient,
  teamId: string,
  roster: readonly OplRosterMember[],
): Promise<number> {
  const { userIds, others } = rosterMatches(roster, await memberDiscordIds(tx, teamId));
  await tx.oplRosterMatch.deleteMany({ where: { teamId } });
  if (userIds.length > 0) {
    await tx.oplRosterMatch.createMany({ data: userIds.map((userId) => ({ teamId, userId })) });
  }
  return others;
}

/**
 * A member left or was removed: the match goes, and the person counts among the others, as they
 * still stand in the OPL roster until the next check.
 */
export async function dropRosterMatches(
  tx: Prisma.TransactionClient,
  teamId: string,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const { count } = await tx.oplRosterMatch.deleteMany({
    where: { teamId, userId: { in: [...userIds] } },
  });
  if (count === 0) return;
  await tx.team.updateMany({
    where: { id: teamId, oplTeamId: { not: null } },
    data: { oplRosterOthers: { increment: count } },
  });
}

/** Removes the team's OPL link and its matches; internal, without permission check. */
export async function clearTeamOpl(db: Db, teamId: string): Promise<void> {
  await db.oplRosterMatch.deleteMany({ where: { teamId } });
  await db.team.update({ where: { id: teamId }, data: NO_TEAM_OPL });
}

export async function clearUserOpl(db: Db, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: NO_USER_OPL });
}

/**
 * Links the user's OPL profile (SPEC N-35), only if its Discord ID is the account's. OPL verifies
 * the Discord ID of a profile through Discord.
 */
export async function linkOplUser(input: {
  userId: string;
  url: string;
  opl: OplApi | null;
  now: Date;
  random?: Random;
}): Promise<void> {
  const user = await requireUser(input.userId);
  const oplUserId = parseOplUrl("user", input.url);
  const result = await callOpl(input.opl, (api) => api.user(oplUserId));
  if (result.kind === "gone") throw new DomainError("NOT_FOUND", "oplUserNotFound");
  const taken = () => new DomainError("CONFLICT", "oplProfileTaken");
  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      await requireUser(user.id, tx);
      // Read under the lock: the Discord link is what the account has now.
      const discordId = await getDiscordId(user.id, tx);
      if (!result.discordId || result.discordId !== discordId) {
        throw new DomainError("INVALID", "oplDiscordMismatch");
      }
      const other = await tx.user.findFirst({
        where: { oplUserId, id: { not: user.id } },
        select: { id: true },
      });
      if (other) throw taken();
      await tx.user.update({
        where: { id: user.id },
        data: {
          oplUserId,
          oplLinkedAt: input.now,
          oplCheckedAt: input.now,
          oplNextCheckAt: nextOplCheck(input.now, input.random),
          oplFailures: 0,
        },
      });
    });
  } catch (error) {
    // Two accounts linking the same profile at once (only possible with a changed Discord link).
    if (isUniqueViolation(error)) throw taken();
    throw error;
  }
}

/** Removes the own OPL link. Team links stay (SPEC N-35). */
export async function unlinkOplUser(input: { userId: string }): Promise<void> {
  const user = await requireUser(input.userId);
  await prisma.user.updateMany({
    where: { id: user.id, oplUserId: { not: null } },
    data: NO_USER_OPL,
  });
}

/** Name and short name of an OPL team, to fill in the founding form (SPEC N-35); stores nothing. */
export async function previewOplTeam(input: {
  userId: string;
  url: string;
  opl: OplApi | null;
}): Promise<{ name: string; shortName: string | null }> {
  await requireUser(input.userId);
  const oplTeamId = parseOplUrl("team", input.url);
  const result = await callOpl(input.opl, (api) => api.teamRoster(oplTeamId));
  if (result.kind === "gone") throw new DomainError("NOT_FOUND", "oplTeamNotFound");
  return { name: result.name, shortName: result.shortName };
}

/** A checked OPL team for a link: its ID, roster and the captain's OPL ID it was checked for. */
export type CheckedOplTeam = {
  oplTeamId: number;
  roster: OplRosterMember[];
  captainOplUserId: number;
};

/**
 * Asks OPL whether the captain may link this team: the captain has a linked profile and stands in
 * the roster (SPEC N-35). Outside any transaction.
 */
export async function checkOplTeamForCaptain(
  captain: { oplUserId: number | null },
  url: string,
  opl: OplApi | null,
): Promise<CheckedOplTeam> {
  const oplTeamId = parseOplUrl("team", url);
  const captainOplUserId = captain.oplUserId;
  if (captainOplUserId === null) throw new DomainError("INVALID", "oplAccountRequired");
  const result = await callOpl(opl, (api) => api.teamRoster(oplTeamId));
  if (result.kind === "gone") throw new DomainError("NOT_FOUND", "oplTeamNotFound");
  if (!result.members.some((member) => member.oplUserId === captainOplUserId)) {
    throw new DomainError("INVALID", "oplNotInRoster");
  }
  return { oplTeamId, roster: result.members, captainOplUserId };
}

export function oplTeamTaken(): DomainError {
  return new DomainError("CONFLICT", "oplTeamTaken");
}

/**
 * Writes a checked link onto the team under its lock: the captain still has the profile it was
 * checked for, and no other team has the OPL team. Also used by createTeam.
 */
export async function applyOplTeamLink(
  tx: Prisma.TransactionClient,
  input: {
    teamId: string;
    captain: { oplUserId: number | null };
    checked: CheckedOplTeam;
    now: Date;
    random?: Random;
  },
): Promise<void> {
  const { teamId, checked, now } = input;
  if (input.captain.oplUserId !== checked.captainOplUserId) {
    throw new DomainError("INVALID", "oplAccountRequired");
  }
  const other = await tx.team.findFirst({
    where: { oplTeamId: checked.oplTeamId, id: { not: teamId } },
    select: { id: true },
  });
  if (other) throw oplTeamTaken();
  const others = await writeRosterMatches(tx, teamId, checked.roster);
  await tx.team.update({
    where: { id: teamId },
    data: {
      oplTeamId: checked.oplTeamId,
      oplLinkedAt: now,
      oplCheckedAt: now,
      oplNextCheckAt: nextOplCheck(now, input.random),
      oplFailures: 0,
      oplRosterOthers: others,
    },
  });
}

/** Links the team with an OPL team (SPEC N-35): captain of an active team, in the OPL roster. */
export async function linkOplTeam(input: {
  userId: string;
  teamId: string;
  url: string;
  opl: OplApi | null;
  now: Date;
  random?: Random;
}): Promise<void> {
  const { user } = await requireCaptain(input.userId, input.teamId);
  const checked = await checkOplTeamForCaptain(user, input.url, input.opl);
  try {
    await prisma.$transaction(async (tx) => {
      await lockTeam(tx, input.teamId);
      const { user: captain } = await requireCaptain(input.userId, input.teamId, tx);
      await applyOplTeamLink(tx, { ...input, captain, checked });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw oplTeamTaken();
    throw error;
  }
}

/** Removes the team's OPL link: captain of an active team, as for the external links. */
export async function unlinkOplTeam(input: { userId: string; teamId: string }): Promise<void> {
  await requireCaptain(input.userId, input.teamId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const { team } = await requireCaptain(input.userId, input.teamId, tx);
    if (team.oplTeamId === null) return;
    await clearTeamOpl(tx, team.id);
  });
}

/** The own link for the account settings; null without one. */
export function userOplView(user: {
  oplUserId: number | null;
  oplLinkedAt: Date | null;
  oplCheckedAt: Date | null;
}) {
  if (user.oplUserId === null || !user.oplLinkedAt) return null;
  return {
    id: user.oplUserId,
    url: oplUserUrl(user.oplUserId),
    linkedAt: user.oplLinkedAt,
    checkedAt: user.oplCheckedAt ?? user.oplLinkedAt,
  };
}
