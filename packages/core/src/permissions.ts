// Central permission checks, see the permission table in ARCHITECTURE §7.
// The require* checks read the current state from the database and throw a DomainError.
// The non-throwing predicates only decide what pages offer; mutations always run the require*
// checks inside their transaction as well.
import { prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { DomainError, type Problem, problemError } from "./errors.ts";
import { READY_MEMBER_COUNT, isTeamReady } from "./readiness.ts";
import { isAdmin } from "./users.ts";

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
  message: `Euer Team hat noch keine ${READY_MEMBER_COUNT} verifizierten Mitglieder.`,
};

type ActingUser = { id: string; verifiedAt: Date | null };
type ActingTeam = { captainId: string; bannedAt: Date | null };

/** The captain role (Team.captainId is its only source, ARCHITECTURE §4). */
export function isCaptainOf(user: { id: string }, team: { captainId: string }): boolean {
  return team.captainId === user.id;
}

/**
 * Why requireCaptain fails for a team that is not dissolved. A ban is final in the MVP (§4), so it
 * is then the only reason: nothing else the user could fix would help.
 */
function captainProblems(user: ActingUser, team: ActingTeam): Problem[] {
  if (team.bannedAt) return [TEAM_BANNED];
  return isCaptainOf(user, team) ? [] : [NOT_CAPTAIN];
}

/** Logged in and not banned. */
export async function requireUser(userId: string | null | undefined, db: Db = prisma) {
  if (!userId) {
    throw new DomainError("UNAUTHENTICATED", "Bitte melde dich an.");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new DomainError("UNAUTHENTICATED", "Bitte melde dich an.");
  }
  if (user.bannedAt) {
    throw new DomainError("BANNED", "Dein Konto ist gesperrt.");
  }
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
  const [problem] = captainProblems(user, team);
  if (problem) throw problemError(problem);
  return { user, team };
}

/** requireCaptain plus the captain is verified: needed for all scrim actions. */
export async function requireActingCaptain(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const result = await requireCaptain(userId, teamId, db);
  if (!result.user.verifiedAt) throw problemError(CAPTAIN_NOT_VERIFIED);
  return result;
}

/** Member of a team that is not dissolved. Banned teams still count, so members can leave them. */
export async function requireTeamMember(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const user = await requireUser(userId, db);
  const member = await db.teamMember.findUnique({
    where: { userId: user.id },
    include: { team: true },
  });
  if (!member || member.teamId !== teamId || member.team.dissolvedAt) {
    throw new DomainError("FORBIDDEN", "Du bist nicht in diesem Team.");
  }
  return { user, team: member.team };
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

/**
 * requireActingCaptain for the user's own team: scrim actions always act for the team
 * the user is in.
 */
export async function requireOwnActingCaptain(userId: string | null | undefined, db: Db = prisma) {
  const user = await requireUser(userId, db);
  const membership = await db.teamMember.findUnique({ where: { userId: user.id } });
  if (!membership) {
    throw new DomainError("FORBIDDEN", "Du bist in keinem Team.");
  }
  return requireActingCaptain(user.id, membership.teamId, db);
}

/**
 * Why requireActingCaptain fails, in its order, for a team that is not dissolved (callers filter
 * dissolved teams, as requireCaptain answers NOT_FOUND for them).
 */
export function actingCaptainProblems(user: ActingUser, team: ActingTeam): Problem[] {
  const problems = captainProblems(user, team);
  if (problems.length === 0 && !user.verifiedAt) problems.push(CAPTAIN_NOT_VERIFIED);
  return problems;
}

/**
 * Non-throwing counterpart of requireActingCaptain for pages, so they only offer scrim actions
 * the user may run: null if allowed, otherwise the reason to show instead.
 */
export function actingCaptainProblem(user: ActingUser, team: ActingTeam): Problem | null {
  return actingCaptainProblems(user, team)[0] ?? null;
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
