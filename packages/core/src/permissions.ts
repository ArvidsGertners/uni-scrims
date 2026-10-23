// Central permission checks, see the permission table in ARCHITECTURE §7.
// The require* checks read the current state from the database and throw a DomainError.
// The non-throwing predicates only decide what pages offer; mutations always run the require*
// checks inside their transaction as well.
import { prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { AccountIncompleteError, DomainError, type Problem, problemError } from "./errors.ts";
import { READY_MEMBER_COUNT, isTeamReady } from "./readiness.ts";
import {
  type AccountSetupStep,
  accountSetupStep,
  getDiscordId,
  isAdmin,
  isLoggedOutUser,
} from "./users.ts";

/** Shown when an action needs a complete account; pages redirect to the step instead (§5.8). */
const SETUP_STEP_MESSAGES: Record<AccountSetupStep, string> = {
  COMPLETE_ACCOUNT: "Bitte vervollständige zuerst dein Konto.",
  VERIFY_EMAIL: "Bitte bestätige zuerst deine E-Mail-Adresse.",
  LINK_DISCORD: "Bitte verknüpfe zuerst dein Discord-Konto.",
};

// Thrown by the require* checks and shown by the pages with the same text.
const TEAM_BANNED: Problem = {
  kind: "TEAM_BANNED",
  code: "FORBIDDEN",
  message: "Das Team ist gesperrt.",
};
// Only ever about the user's own team: requireCaptain answers non-members before it gets here.
const NOT_CAPTAIN: Problem = {
  kind: "NOT_CAPTAIN",
  code: "FORBIDDEN",
  message: "Das kann nur euer Captain.",
};
const CAPTAIN_NOT_VERIFIED: Problem = {
  kind: "CAPTAIN_NOT_VERIFIED",
  code: "NOT_VERIFIED",
  message: "Als Captain musst du für Scrim-Aktionen verifiziert sein.",
};
// Always about the user's own team: posting, applying and confirming as host.
const TEAM_NOT_READY: Problem = {
  kind: "TEAM_NOT_READY",
  code: "FORBIDDEN",
  message: `Euer Team hat noch keine ${READY_MEMBER_COUNT} verifizierten Spieler.`,
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
 * Non-throwing counterpart of requireActingCaptain for the user's own team (callers filter dissolved
 * teams): null if allowed, otherwise the one reason. The only place that fixes the order;
 * requireActingCaptain and requireOwnActingCaptain throw exactly this.
 */
export function actingCaptainProblem(user: ActingUser, team: ActingTeam): Problem | null {
  return captainProblem(user, team) ?? captainVerificationProblem(user);
}

/** The user and the Discord ID, unless the account counts as logged out (isLoggedOutUser). */
async function loadAccountUser(userId: string | null | undefined, db: Db) {
  if (!userId) {
    throw new DomainError("UNAUTHENTICATED", "Bitte melde dich an.");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  const discordId = user ? await getDiscordId(user.id, db) : null;
  if (!user || isLoggedOutUser(user, discordId)) {
    throw new DomainError("UNAUTHENTICATED", "Bitte melde dich an.");
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

/** Logged in, not banned, and the account is complete (§5.8). */
export async function requireUser(userId: string | null | undefined, db: Db = prisma) {
  const { user, discordId } = await loadAccountUser(userId, db);
  if (user.bannedAt) {
    throw new DomainError("BANNED", "Dein Konto ist gesperrt.");
  }
  const step = accountSetupStep(user, discordId !== null);
  if (step) throw new AccountIncompleteError(step, SETUP_STEP_MESSAGES[step]);
  return user;
}

export async function requireVerified(userId: string | null | undefined, db: Db = prisma) {
  const user = await requireUser(userId, db);
  if (!user.verifiedAt) {
    throw new DomainError("NOT_VERIFIED", "Dafür musst du verifiziert sein.");
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
 * The user's team if it is not dissolved, else null. The one membership rule for pages and checks
 * (dissolving deletes the memberships; the check covers rows that are left anyway).
 */
export async function findOwnTeam(userId: string, db: Db = prisma) {
  const membership = await db.teamMember.findUnique({ where: { userId }, select: { team: true } });
  return membership && !membership.team.dissolvedAt ? membership.team : null;
}

/** Member of a team that is not dissolved. Banned teams still count, so members can leave them. */
export async function requireTeamMember(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const user = await requireUser(userId, db);
  const team = await findOwnTeam(user.id, db);
  if (!team || team.id !== teamId) {
    throw new DomainError("FORBIDDEN", "Du bist nicht in diesem Team.");
  }
  return { user, team };
}

export async function requireTeamReady(teamId: string, db: Db = prisma): Promise<void> {
  const problem = teamReadyProblem(await isTeamReady(teamId, db));
  if (problem) throw problemError(problem);
}

/** Admin = the Discord ID from account.accountId is listed in ADMIN_DISCORD_IDS. */
export async function requireAdmin(userId: string | null | undefined, db: Db = prisma) {
  const user = await requireUser(userId, db);
  if (!(await isAdmin(user.id, db))) {
    throw new DomainError("FORBIDDEN", "Nur für Admins.");
  }
  return user;
}

/** The user and the team they are in; user and membership are read once. */
async function requireOwnTeam(userId: string | null | undefined, db: Db) {
  const user = await requireUser(userId, db);
  const team = await findOwnTeam(user.id, db);
  if (!team) {
    throw new DomainError("FORBIDDEN", "Du bist in keinem Team.");
  }
  return { user, team };
}

/**
 * requireCaptain for the user's own team, for team management that starts without a team ID
 * (/setup in Discord). Verification is not required.
 */
export async function requireOwnCaptain(userId: string | null | undefined, db: Db = prisma) {
  const { user, team } = await requireOwnTeam(userId, db);
  const problem = captainProblem(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}

/**
 * requireActingCaptain for the user's own team: scrim actions always act for the team
 * the user is in.
 */
export async function requireOwnActingCaptain(userId: string | null | undefined, db: Db = prisma) {
  const { user, team } = await requireOwnTeam(userId, db);
  const problem = actingCaptainProblem(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}

/**
 * Non-throwing counterpart of requireTeamReady: posting, applying and confirming need a ready team,
 * withdrawing, deleting, cancelling and feedback do not (SPEC P0-3).
 */
export function teamReadyProblem(ready: boolean): Problem | null {
  return ready ? null : TEAM_NOT_READY;
}

type ScrimTeams = { hostTeamId: string; guestTeamId: string };

/** §7: scrim detail and "Meine Scrims" only for members of the two teams. */
export function isScrimTeam(teamId: string | null | undefined, scrim: ScrimTeams): boolean {
  return !!teamId && (teamId === scrim.hostTeamId || teamId === scrim.guestTeamId);
}

/** §7: the applications of a request only for members of the creating team. */
export function canSeeApplications(
  teamId: string | null | undefined,
  request: { teamId: string },
): boolean {
  return !!teamId && teamId === request.teamId;
}

/** §7: cancelling and feedback by the current, verified captain of one of the two teams. */
export async function requireScrimActingCaptain(
  userId: string | null | undefined,
  scrim: ScrimTeams,
  db: Db = prisma,
) {
  const result = await requireOwnActingCaptain(userId, db);
  if (!isScrimTeam(result.team.id, scrim)) {
    throw new DomainError("NOT_FOUND", "Scrim nicht gefunden.");
  }
  return result;
}
