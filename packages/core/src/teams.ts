// Team lifecycle (SPEC P0-3, ARCHITECTURE §5.5). All paths ignore dissolved teams.
import { randomBytes } from "node:crypto";
import {
  AppStatus,
  MemberRole,
  type Prisma,
  RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { MAX_TEAM_MEMBERS } from "../config/limits.ts";
import { type Db, isUniqueViolation } from "./db.ts";
import { DomainError, problemError } from "./errors.ts";
import { type Message, msg } from "./i18n/render.ts";
import { inTransaction, lockRequest, lockScrim, lockTeam, lockUser } from "./locks.ts";
import {
  captainProblem,
  findOwnTeam,
  findOwnTeams,
  isCaptainOf,
  requireActiveAccountUser,
  requireCaptain,
  requireTeamMember,
  requireUser,
} from "./permissions.ts";
import { teamRank, teamRankSummary } from "./ranks.ts";
import {
  countVerifiedPlayerMembers,
  isFullyVerifiedCount,
  isPlayingRole,
  isListedTeam,
  isTeamActive,
  isVerifiedMember,
} from "./readiness.ts";
import { closeOpenRequest, openRequestWhere } from "./requests.ts";
import {
  type TeamInput,
  type TeamLinksInput,
  memberRoleSchema,
  parseInput,
  teamInputSchema,
  teamLinksSchema,
  teamListedSchema,
  teamVerifiedApplicantsOnlySchema,
} from "./schemas.ts";
import { cancelScheduledScrim } from "./scrims.ts";
import { NO_TEAM_LINKS, TEAM_LINK_PLATFORMS, teamLinkColumns, toTeamLinks } from "./team-links.ts";
import { clearTeamLogo, loadTeamLogoInfo, teamLogoInfo, teamLogoSelect } from "./team-logo.ts";
import { avatarVersion, findUserByDiscordId, notDeletedUserWhere } from "./users.ts";

export { MAX_TEAM_MEMBERS };
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
export const TRANSFER_CAPTAIN_FIRST = msg("transferCaptainFirst");

function nameTaken(): DomainError {
  return new DomainError("CONFLICT", "teamNameTaken");
}

/** The teams that count for User.teamLimit: all that are not dissolved, banned ones included. */
export async function countOwnTeams(userId: string, db: Db = prisma): Promise<number> {
  return db.teamMember.count({ where: { userId, team: { dissolvedAt: null } } });
}

/** Why the user cannot found or join another team (SPEC N-17), or null; also shown by the pages. */
export function teamLimitProblem(teamCount: number, teamLimit: number): Message | null {
  return teamCount < teamLimit ? null : msg("teamLimitReached", { count: teamCount });
}

/** Throws the limit problem; called under the user lock, so parallel joins cannot exceed it. */
async function requireBelowTeamLimit(user: { id: string; teamLimit: number }, db: Db) {
  const problem = teamLimitProblem(await countOwnTeams(user.id, db), user.teamLimit);
  if (problem) throw new DomainError("CONFLICT", problem);
}

export async function createTeam(input: TeamInput & { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const data = parseInput(teamInputSchema, input);
  await requireBelowTeamLimit(user, prisma);
  try {
    return await prisma.$transaction(async (tx) => {
      // Nobody sees the new team yet, so the user row is the first lock (§4). A ban or deletion that
      // holds it finishes first and is seen here; a later one sees the membership and asks to retry.
      // The lock also counts the teams once for parallel foundings and joins (§5.20).
      await lockUser(tx, user.id);
      const locked = await requireUser(user.id, tx);
      await requireBelowTeamLimit(locked, tx);
      const team = await tx.team.create({
        data: {
          name: data.name,
          nameNormalized: normalizeTeamName(data.name),
          tag: data.tag,
          captainId: user.id,
          inviteCode: generateInviteCode(),
          createdAt: input.now,
        },
      });
      // The captain is always a member too; the new team becomes the active one (§5.20).
      await tx.teamMember.create({
        data: { teamId: team.id, userId: user.id, joinedAt: input.now },
      });
      await tx.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
      return team;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/**
 * Makes one of the user's teams the active one (SPEC N-17), on all devices. No lock: a membership
 * that ends right after the check leaves a pointer findOwnTeam ignores (§5.20).
 */
export async function setActiveTeam(input: { userId: string; teamId: string }): Promise<void> {
  const { user } = await requireTeamMember(input.userId, input.teamId);
  // Not for an account deleted or banned meanwhile.
  await prisma.user.updateMany({
    where: { ...notDeletedUserWhere(user.id), bannedAt: null },
    data: { activeTeamId: input.teamId },
  });
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
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw nameTaken();
    throw error;
  }
}

/**
 * External links of the team (SPEC N-15, §5.18): captain of a team that is not banned, verification
 * is not needed. An empty field removes its link. Only a change writes, so the version an admin saw
 * stays valid while the captain saves the same links again.
 */
export async function updateTeamLinks(input: {
  userId: string;
  teamId: string;
  links: TeamLinksInput;
  now: Date;
}) {
  await requireCaptain(input.userId, input.teamId);
  const links = parseInput(teamLinksSchema, input.links);
  await prisma.$transaction(async (tx) => {
    // Checked again under the team lock, like updateTeam: a dissolved team keeps no links.
    await lockTeam(tx, input.teamId);
    const { team } = await requireCaptain(input.userId, input.teamId, tx);
    const data = teamLinkColumns(links);
    const changed = TEAM_LINK_PLATFORMS.some(
      (platform) => team[platform.field] !== data[platform.field],
    );
    if (!changed) return;
    await tx.team.update({
      where: { id: input.teamId },
      data: { ...data, linksUpdatedAt: toTeamLinks(data).length > 0 ? input.now : null },
    });
  });
}

/**
 * Shows or hides the team in the teams list (SPEC N-20, §5.23): captain of a team that is not
 * banned, verification is not needed, like the links. Only a change writes.
 */
export async function setTeamListed(input: { userId: string; teamId: string; listed: boolean }) {
  await requireCaptain(input.userId, input.teamId);
  const listed = parseInput(teamListedSchema, input.listed);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const { team } = await requireCaptain(input.userId, input.teamId, tx);
    if (team.listed === listed) return;
    await tx.team.update({ where: { id: input.teamId }, data: { listed } });
  });
}

/**
 * Whether only fully verified teams may apply to the team's requests (SPEC N-21, §5.24): captain of
 * a team that is not banned, verification is not needed, like setTeamListed. Only a change writes.
 */
export async function setVerifiedApplicantsOnly(input: {
  userId: string;
  teamId: string;
  value: boolean;
}) {
  await requireCaptain(input.userId, input.teamId);
  const value = parseInput(teamVerifiedApplicantsOnlySchema, input.value);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    const { team } = await requireCaptain(input.userId, input.teamId, tx);
    if (team.verifiedApplicantsOnly === value) return;
    await tx.team.update({ where: { id: input.teamId }, data: { verifiedApplicantsOnly: value } });
  });
}

/**
 * Whether the user should verify: not verified and captain of an active team, since scrims need
 * only the captain's verification (SPEC N-21). The warning dot at "Konto" shows it.
 */
export function needsCaptainVerification(
  user: { id: string; verifiedAt: Date | null },
  teams: readonly { captainId: string; bannedAt: Date | null; dissolvedAt: Date | null }[],
): boolean {
  return (
    !isVerifiedMember(user) && teams.some((team) => isCaptainOf(user, team) && isTeamActive(team))
  );
}

/** Removes all external links (dissolution, admins); internal, without permission check. */
export async function clearTeamLinks(db: Db, teamId: string): Promise<void> {
  await db.team.update({
    where: { id: teamId },
    data: { ...NO_TEAM_LINKS, linksUpdatedAt: null },
  });
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
 * /setup (ARCHITECTURE §6.4): links a Discord server and channel to one of the caller's teams, so
 * bookings, cancellations and reminders are also posted there. Only the captain of a team that is
 * not banned, and not on the hub server: the bot can post there, and every team would post in
 * public. `team` is what the option holds: a suggestion's ID or a typed name; without it the
 * caller's only team as captain (§5.20).
 */
export async function linkTeamChannel(
  input: { discordUserId: string; guildId: string; channelId: string; team?: string | null },
  env: Record<string, string | undefined> = process.env,
) {
  if (input.guildId === env.HUB_GUILD_ID) {
    throw new DomainError("INVALID", "setupOnHub");
  }
  const user = await findUserByDiscordId(input.discordUserId);
  const teamId = await chosenTeamId(user?.id, input.team?.trim() || null);
  await requireCaptain(user?.id, teamId);
  return prisma.$transaction(async (tx) => {
    // Checked again under the team lock: the role or the ban may have changed meanwhile.
    await lockTeam(tx, teamId);
    await requireCaptain(user?.id, teamId, tx);
    return tx.team.update({
      where: { id: teamId },
      data: { discordGuildId: input.guildId, discordChannelId: input.channelId },
      select: { id: true, name: true },
    });
  });
}

/** What /setup can link: the user's teams as captain that are not banned (§6.4). */
function linkableTeams<T extends { captainId: string; bannedAt: Date | null }>(
  user: { id: string },
  teams: T[],
): T[] {
  return teams.filter((team) => isCaptainOf(user, team) && !team.bannedAt);
}

/**
 * The team /setup links. A suggestion's ID, or a typed name of a linkable team; anything else is
 * checked by requireCaptain as an ID and refused. Without a choice the only linkable team, else the
 * reason, as requireCaptain would give it for the own team.
 */
async function chosenTeamId(
  userId: string | null | undefined,
  choice: string | null,
): Promise<string> {
  const user = await requireUser(userId);
  const teams = await findOwnTeams(user.id);
  const linkable = linkableTeams(user, teams);
  if (choice) {
    const name = choice.toLowerCase();
    const team =
      linkable.find((candidate) => candidate.id === choice) ??
      linkable.find((candidate) => candidate.name.toLowerCase() === name);
    return team?.id ?? choice;
  }
  if (linkable.length > 1) {
    throw new DomainError("INVALID", "setupPickTeam");
  }
  const team = linkable[0] ?? teams.find((own) => isCaptainOf(user, own)) ?? teams[0];
  if (!team) throw new DomainError("FORBIDDEN", "notInAnyTeam");
  return team.id;
}

/** Discord shows at most this many suggestions. */
const MAX_SUGGESTIONS = 25;

/**
 * Suggestions for the team option of /setup: the linkable teams whose name contains `query`, by
 * name. Empty for unknown, banned or incomplete accounts.
 */
export async function listCaptainTeamsForDiscordUser(discordUserId: string, query: string) {
  const user = await findUserByDiscordId(discordUserId);
  if (!user) return [];
  try {
    await requireUser(user.id);
  } catch (error) {
    if (error instanceof DomainError) return [];
    throw error;
  }
  const part = query.trim().toLowerCase();
  return linkableTeams(user, await findOwnTeams(user.id))
    .filter((team) => team.name.toLowerCase().includes(part))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .slice(0, MAX_SUGGESTIONS)
    .map((team) => ({ id: team.id, name: team.name }));
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
 * name, an address and a password (SPEC N-3). Since Phase 21 for the team the page shows it for.
 */
export async function handOverCaptain(input: {
  userId: string;
  teamId: string;
  newCaptainId: string;
}) {
  await transferCaptainWith(requireAccountCaptain, input);
}

/** Captain of one of the user's teams (not banned), like requireCaptain but for incomplete accounts. */
async function requireAccountCaptain(userId: string | null | undefined, teamId: string, db: Db) {
  const user = await requireActiveAccountUser(userId, db);
  const membership = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
    select: { team: true },
  });
  const team = membership?.team;
  if (!team || team.dissolvedAt) {
    throw new DomainError("FORBIDDEN", "notInTeam");
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
      throw new DomainError("INVALID", "alreadyCaptain");
    }
    const member = await tx.teamMember.findUnique({
      where: { teamId_userId: { teamId: input.teamId, userId: input.newCaptainId } },
    });
    if (!member) {
      throw new DomainError("INVALID", "onlyMembersCaptain");
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
      throw new DomainError("INVALID", "cannotRemoveSelf");
    }
    const removed = await tx.teamMember.deleteMany({
      where: { teamId: input.teamId, userId: input.memberId },
    });
    if (removed.count === 0) {
      throw new DomainError("NOT_FOUND", "memberNotFound");
    }
  });
}

/**
 * Player, substitute or coach (SPEC N-1); only the first two count for the badge. The captain sets it
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
      throw new DomainError("NOT_FOUND", "memberNotFound");
    }
  });
}

/**
 * Join via invite code of an active team; max. 10 members, and up to User.teamLimit teams per user
 * (SPEC N-17). The joined team becomes the active one.
 */
export async function joinTeam(input: { userId: string; inviteCode: string; now: Date }) {
  const user = await requireUser(input.userId);
  return prisma.$transaction(async (tx) => {
    const found = await tx.team.findUnique({ where: { inviteCode: input.inviteCode } });
    if (!found) throw invalidInvite();
    // Lock first, then re-check: parallel joins must not exceed the member limit.
    await lockTeam(tx, found.id);
    const team = await tx.team.findUniqueOrThrow({ where: { id: found.id } });
    if (team.inviteCode !== input.inviteCode || !isTeamActive(team)) {
      throw invalidInvite();
    }
    // Team before user (§4), as in banUser and deleteAccount: a ban or deletion that holds the user
    // row finishes first and is seen here; a later one sees the membership and asks to retry. The
    // user lock also counts the teams once for parallel joins to different teams (§5.20).
    await lockUser(tx, user.id);
    const locked = await requireUser(user.id, tx);
    const membership = await tx.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
    });
    if (membership) throw new DomainError("CONFLICT", "alreadyInTeam");
    await requireBelowTeamLimit(locked, tx);
    if ((await tx.teamMember.count({ where: { teamId: team.id } })) >= MAX_TEAM_MEMBERS) {
      throw new DomainError("CONFLICT", "teamFull");
    }
    await tx.teamMember.create({
      data: { teamId: team.id, userId: user.id, joinedAt: input.now },
    });
    await tx.user.update({ where: { id: user.id }, data: { activeTeamId: team.id } });
    return team;
  });
}

function invalidInvite(): DomainError {
  return new DomainError("NOT_FOUND", "inviteInvalid");
}

/**
 * Players can always leave, also banned teams. The captain only as the last member,
 * which dissolves the team. A pointer of User.activeTeamId to the team may stay: findOwnTeam
 * ignores teams the user is not in (§5.20).
 */
export async function leaveTeam(input: { userId: string; teamId: string; now: Date }) {
  await requireTeamMember(input.userId, input.teamId);
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    // Read again under the lock: the user may have left or been removed meanwhile.
    const { user, team } = await requireTeamMember(input.userId, input.teamId, tx);
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
 * No hard delete: scrims keep the team ID. Name and invite link become free/invalid, the logo and
 * the external links go.
 */
export async function dissolveTeam(teamId: string, now: Date, db: Db = prisma): Promise<void> {
  await inTransaction(db, async (tx) => {
    await retireTeamActivity(teamId, now, tx);
    await tx.teamMember.deleteMany({ where: { teamId } });
    await clearTeamLogo(tx, teamId);
    await clearTeamLinks(tx, teamId);
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
 * Locks what retireTeamActivity locks, for several teams retired in one transaction (banUser and
 * deleteAccount since Phase 21): first all their requests together with `requestIds` of the caller,
 * then all their scrims, each kind in id order (§4). retireTeamActivity then finds them locked.
 */
export async function lockRetirements(
  tx: Prisma.TransactionClient,
  teamIds: string[],
  now: Date,
  requestIds: string[] = [],
): Promise<void> {
  const retired: string[] = [];
  for (const teamId of teamIds) retired.push(...(await retirementRequestIds(teamId, now, tx)));
  for (const id of [...new Set([...requestIds, ...retired])].sort()) await lockRequest(tx, id);
  if (teamIds.length === 0) return;
  const scrims = await tx.scrim.findMany({
    where: retiredScrimWhere(teamIds, now),
    orderBy: { id: "asc" },
    select: { id: true },
  });
  for (const scrim of scrims) await lockScrim(tx, scrim.id);
}

/** The scrims a retirement cancels: future, scheduled scrims of the teams. One rule for both users. */
function retiredScrimWhere(teamIds: string[], now: Date): Prisma.ScrimWhereInput {
  return {
    status: ScrimStatus.SCHEDULED,
    startsAt: { gt: now },
    OR: [{ hostTeamId: { in: teamIds } }, { guestTeamId: { in: teamIds } }],
  };
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
      where: retiredScrimWhere([teamId], now),
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

/** The universities of the verified members, not summarized (SPEC P0-3, N-20). */
export function verifiedUniversityNames(members: MemberUniversity[]): (string | null)[] {
  return members
    .filter(({ user }) => isVerifiedMember(user))
    .map(({ user }) => user.university?.name ?? user.universityOther);
}

/** Universities represented on a team card: those of the verified members (SPEC P0-3). */
export function teamUniversities(members: MemberUniversity[]) {
  return summarizeUniversities(verifiedUniversityNames(members));
}

const memberSelect = {
  joinedAt: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      rank: true,
      avatarUpdatedAt: true,
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
      // The same order as the teams list (SPEC N-20).
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    }),
    loadTeamLogoInfo(team),
  ]);

  const isCaptain = isCaptainOf(user, team);
  const members = memberRows.map(({ user: member, joinedAt, role }) => ({
    id: member.id,
    name: member.name,
    avatarVersion: avatarVersion(member),
    joinedAt,
    role,
    isCaptain: isCaptainOf(member, team),
    // Players and substitutes count for the badge once verified, the captain needs it for scrim
    // actions (SPEC N-21); coaches need none (N-1).
    needsVerification: member.id === team.captainId || role !== MemberRole.COACH,
    // The own team sees the members' own ranks (SPEC N-16); the teams list too (N-20).
    rank: member.rank,
    /** Whether the member's own rank counts for the team rank: players and substitutes. */
    countsForTeamRank: isPlayingRole(role),
    status: isVerifiedMember(member)
      ? ("VERIFIED" as const)
      : member.pendingVerification
        ? ("PENDING" as const)
        : ("UNVERIFIED" as const),
  }));
  // Verified players and substitutes; coaches never count (SPEC N-1).
  const verifiedPlayerCount = countVerifiedPlayerMembers(memberRows);
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    // Computed from the players and substitutes with a rank (SPEC N-16).
    ...teamRankSummary(memberRows),
    game: team.game,
    logo,
    links: toTeamLinks(team),
    // On the teams list (SPEC N-20); a banned team is not, whatever the captain chose.
    listed: isListedTeam(team),
    // Only fully verified teams may apply to the team's requests (SPEC N-21).
    verifiedApplicantsOnly: team.verifiedApplicantsOnly,
    banned: team.bannedAt !== null,
    isCaptain,
    // Only the captain manages the invite link.
    inviteCode: isCaptain ? team.inviteCode : null,
    members,
    verifiedPlayerCount,
    // Counted once, judged by the same rule as the badge on the other pages (SPEC N-21).
    fullyVerified: isFullyVerifiedCount(verifiedPlayerCount),
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
    rank: teamRank(team.members),
    logo: teamLogoInfo(team),
    memberCount: team.members.length,
    full: team.members.length >= MAX_TEAM_MEMBERS,
    universities: teamUniversities(team.members),
  };
}
