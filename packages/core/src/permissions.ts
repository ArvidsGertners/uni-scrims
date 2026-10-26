// Central permission checks, see the permission table in ARCHITECTURE §7.
// The require* checks read the current state from the database and throw a DomainError.
// The non-throwing predicates only decide what pages offer; mutations always run the require*
// checks inside their transaction as well.
import { StaffRole, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import {
  AccountIncompleteError,
  DomainError,
  type Problem,
  TwoFactorRequiredError,
  isDomainError,
  problemError,
} from "./errors.ts";
import { type PlainMessageKey, msg } from "./i18n/render.ts";
import { type AccountSetupStep, accountSetupStep, getDiscordId, isLoggedOutUser } from "./users.ts";

/** Shown when an action needs a complete account; pages redirect to the step instead (§5.8). */
const SETUP_STEP_MESSAGES: Record<AccountSetupStep, PlainMessageKey> = {
  COMPLETE_ACCOUNT: "completeAccountFirst",
  VERIFY_EMAIL: "verifyEmailFirst",
  LINK_DISCORD: "linkDiscordFirst",
};

// Thrown by the require* checks and shown by the pages with the same text.
const TEAM_BANNED: Problem = {
  kind: "TEAM_BANNED",
  code: "FORBIDDEN",
  text: msg("teamBanned"),
};
// Only ever about the user's own team: requireCaptain answers non-members before it gets here.
const NOT_CAPTAIN: Problem = {
  kind: "NOT_CAPTAIN",
  code: "FORBIDDEN",
  text: msg("notCaptain"),
};
const CAPTAIN_NOT_VERIFIED: Problem = {
  kind: "CAPTAIN_NOT_VERIFIED",
  code: "NOT_VERIFIED",
  text: msg("captainNotVerified"),
};
type ActingUser = { id: string; verifiedAt: Date | null };
type ActingTeam = { captainId: string; bannedAt: Date | null };

/** The captain role (Team.captainId is its only source, ARCHITECTURE §4). */
export function isCaptainOf(user: { id: string }, team: { captainId: string }): boolean {
  return team.captainId === user.id;
}

/**
 * Why requireCaptain fails for a member of a team that is not dissolved, or null. A ban is final in
 * the MVP (§4), so it comes first: nothing else the user could fix would help.
 */
export function captainProblem(user: ActingUser, team: ActingTeam): Problem | null {
  if (team.bannedAt) return TEAM_BANNED;
  return isCaptainOf(user, team) ? null : NOT_CAPTAIN;
}

/** Scrim actions also need a verified captain (SPEC P0-3); only checked after captainProblem. */
export function captainVerificationProblem(user: { verifiedAt: Date | null }): Problem | null {
  return user.verifiedAt ? null : CAPTAIN_NOT_VERIFIED;
}

/**
 * Non-throwing counterpart of requireActingCaptain for one of the user's teams (callers filter
 * dissolved teams): null if allowed, otherwise the one reason. The only place that fixes the order;
 * requireActingCaptain and requireScrimActingCaptain throw exactly this.
 */
export function actingCaptainProblem(user: ActingUser, team: ActingTeam): Problem | null {
  return captainProblem(user, team) ?? captainVerificationProblem(user);
}

/** The user and the Discord ID, unless the account counts as logged out (isLoggedOutUser). */
async function loadAccountUser(userId: string | null | undefined, db: Db) {
  if (!userId) {
    throw new DomainError("UNAUTHENTICATED", "signInFirst");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  const discordId = user ? await getDiscordId(user.id, db) : null;
  if (!user || isLoggedOutUser(user, discordId)) {
    throw new DomainError("UNAUTHENTICATED", "signInFirst");
  }
  return { user, discordId };
}

/**
 * Logged in, banned users and incomplete accounts included: only for the account page (deleting,
 * completing, linking Discord; §7, §5.8). A deleted account counts as logged out, so actions that
 * started before the deletion cannot write for it.
 */
export async function requireAccountUser(userId: string | null | undefined, db: Db = prisma) {
  return (await loadAccountUser(userId, db)).user;
}

/**
 * Logged in and not banned, incomplete accounts included: changing the own account's name, address
 * and password (§5.8, §7).
 */
export async function requireActiveAccountUser(userId: string | null | undefined, db: Db = prisma) {
  const { user } = await loadAccountUser(userId, db);
  if (user.bannedAt) {
    throw new DomainError("BANNED", "accountBanned");
  }
  return user;
}

/** Logged in, not banned, and the account is complete (§5.8). */
export async function requireUser(userId: string | null | undefined, db: Db = prisma) {
  const { user, discordId } = await loadAccountUser(userId, db);
  if (user.bannedAt) {
    throw new DomainError("BANNED", "accountBanned");
  }
  const step = accountSetupStep(user, discordId !== null);
  if (step) throw new AccountIncompleteError(step, SETUP_STEP_MESSAGES[step]);
  return user;
}

export async function requireVerified(userId: string | null | undefined, db: Db = prisma) {
  const user = await requireUser(userId, db);
  if (!user.verifiedAt) {
    throw new DomainError("NOT_VERIFIED", "verificationRequired");
  }
  return user;
}

/**
 * Current captain of an active team (neither banned nor dissolved). Verification is not required.
 * Membership comes first: non-members get the same answer for active, banned and dissolved teams,
 * so nobody learns that another team was banned (ARCHITECTURE §4).
 */
export async function requireCaptain(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const { user, team } = await requireTeamMember(userId, teamId, db);
  const problem = captainProblem(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}

/** requireCaptain plus the captain is verified: needed for all scrim actions. */
export async function requireActingCaptain(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const { user, team } = await requireTeamMember(userId, teamId, db);
  const problem = actingCaptainProblem(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}

/**
 * The user's teams that are not dissolved, the last joined first (§5.20). Dissolving deletes the
 * memberships; the filter covers rows that are left anyway.
 */
export async function findOwnTeams(userId: string, db: Db = prisma) {
  const memberships = await db.teamMember.findMany({
    where: { userId, team: { dissolvedAt: null } },
    orderBy: [{ joinedAt: "desc" }, { teamId: "asc" }],
    select: { team: true },
  });
  return memberships.map(({ team }) => team);
}

/**
 * The user's active team (§5.20): User.activeTeamId if the user is still in it and it is not
 * dissolved, else the last joined team, else null. The one rule for what the pages show; actions get
 * the team ID from the page instead.
 */
export async function findOwnTeam(userId: string, db: Db = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { activeTeamId: true } });
  return pickActiveTeam(await findOwnTeams(userId, db), user?.activeTeamId ?? null);
}

/** findOwnTeam's rule for teams that are already loaded (from findOwnTeams, in its order). */
export function pickActiveTeam<T extends { id: string }>(
  teams: T[],
  activeTeamId: string | null,
): T | null {
  return teams.find((team) => team.id === activeTeamId) ?? teams[0] ?? null;
}

/**
 * Member of the team, which is not dissolved. Banned teams still count, so members can leave them.
 * Non-members get the same answer for active, banned and dissolved teams (§4).
 */
export async function requireTeamMember(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const user = await requireUser(userId, db);
  const membership = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
    select: { team: true },
  });
  if (!membership || membership.team.dissolvedAt) {
    throw new DomainError("FORBIDDEN", "notInTeam");
  }
  return { user, team: membership.team };
}

/** Which roles see which part of the admin area (ARCHITECTURE §5.9). */
export const STAFF_AREAS = {
  /** Verification queue and file access. */
  queue: [StaffRole.OPERATOR, StaffRole.ADMIN, StaffRole.REVIEWER],
  /** Disputes, bans, failed notifications, bot status, statistics. */
  admin: [StaffRole.OPERATOR, StaffRole.ADMIN],
  /** Roles and 2FA resets. */
  staff: [StaffRole.OPERATOR],
} as const satisfies Record<string, readonly StaffRole[]>;

export type StaffArea = keyof typeof STAFF_AREAS;

/** Whether a role sees an area of the admin area; for the navigation. */
export function staffArea(role: StaffRole | null, area: StaffArea): boolean {
  return role !== null && (STAFF_AREAS[area] as readonly StaffRole[]).includes(role);
}

/**
 * A complete, unbanned account with one of `roles` and 2FA set up (§5.9). Without 2FA it throws
 * TwoFactorRequiredError, so the pages lead to the setup.
 */
export async function requireStaff(
  userId: string | null | undefined,
  roles: readonly StaffRole[],
  db: Db = prisma,
) {
  const user = await requireStaffMember(userId, db);
  if (!roles.includes(user.staffRole)) {
    throw new DomainError("FORBIDDEN", "adminsOnly");
  }
  if (!user.twoFactorEnabled) throw new TwoFactorRequiredError();
  return user;
}

/** Any role, 2FA not needed yet: setting up the 2FA (§5.9). */
export async function requireStaffMember(userId: string | null | undefined, db: Db = prisma) {
  const user = await requireUser(userId, db);
  if (!user.staffRole) {
    throw new DomainError("FORBIDDEN", "adminsOnly");
  }
  return { ...user, staffRole: user.staffRole };
}

/** Reviewer, admin or operator: the verification queue (§5.9). */
export async function requireReviewer(userId: string | null | undefined, db: Db = prisma) {
  return requireStaff(userId, STAFF_AREAS.queue, db);
}

/** Admin or operator: everything in the admin area except roles (§5.9). */
export async function requireAdmin(userId: string | null | undefined, db: Db = prisma) {
  return requireStaff(userId, STAFF_AREAS.admin, db);
}

/** The operator: roles and 2FA resets (§5.9). */
export async function requireOperator(userId: string | null | undefined, db: Db = prisma) {
  return requireStaff(userId, STAFF_AREAS.staff, db);
}

/**
 * Who sees a user's avatar copy (§5.12, §7): the user, also banned; otherwise an unbanned member of
 * a team they share (also a banned team, whose members still see their team page) or staff with
 * access to the queue.
 */
export async function canSeeAvatar(
  viewer: { id: string; bannedAt: Date | null },
  userId: string,
  db: Db = prisma,
): Promise<boolean> {
  if (viewer.id === userId) return true;
  if (viewer.bannedAt) return false;
  const shared = await db.teamMember.count({
    where: { userId: viewer.id, team: { dissolvedAt: null, members: { some: { userId } } } },
  });
  if (shared > 0) return true;
  try {
    await requireStaff(viewer.id, STAFF_AREAS.queue, db);
    return true;
  } catch (error) {
    if (isDomainError(error)) return false;
    throw error;
  }
}

type ScrimTeams = { hostTeamId: string; guestTeamId: string };

/** §7: scrim detail and "Meine Scrims" only for members of the two teams. */
export function isScrimTeam(teamId: string | null | undefined, scrim: ScrimTeams): boolean {
  return !!teamId && (teamId === scrim.hostTeamId || teamId === scrim.guestTeamId);
}

/**
 * §7: a board request for every logged-in user, a direct request only for members of the
 * requesting and the requested team (SPEC N-26); `memberTeamIds` are the user's teams among them.
 */
export function canSeeRequest(
  memberTeamIds: readonly string[],
  request: { teamId: string; targetTeamId: string | null },
): boolean {
  if (request.targetTeamId === null) return true;
  return memberTeamIds.some((id) => id === request.teamId || id === request.targetTeamId);
}

/** §7: the applications of a request only for members of the creating team. */
export function canSeeApplications(
  teamId: string | null | undefined,
  request: { teamId: string },
): boolean {
  return !!teamId && teamId === request.teamId;
}

/**
 * §7: cancelling and feedback by the current, verified captain of one of the two teams, for the team
 * the page acted for (§5.20). Members of a team outside the scrim learn nothing about it.
 */
export async function requireScrimActingCaptain(
  userId: string | null | undefined,
  teamId: string,
  scrim: ScrimTeams,
  db: Db = prisma,
) {
  const { user, team } = await requireTeamMember(userId, teamId, db);
  if (!isScrimTeam(team.id, scrim)) {
    throw new DomainError("NOT_FOUND", "scrimNotFound");
  }
  const problem = actingCaptainProblem(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}
