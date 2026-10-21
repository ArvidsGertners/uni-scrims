// Central permission checks, see the permission table in ARCHITECTURE §7.
// Every check reads the current state from the database and throws a DomainError.
import { prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { DomainError } from "./errors.ts";
import { isTeamReady } from "./readiness.ts";
import { isAdmin } from "./users.ts";

const TEAM_BANNED = "Das Team ist gesperrt.";
const CAPTAIN_NOT_VERIFIED = "Als Captain musst du für Scrim-Aktionen verifiziert sein.";

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

/** Current captain of an active team (neither banned nor dissolved). Verification is not required. */
export async function requireCaptain(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const user = await requireUser(userId, db);
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team || team.dissolvedAt) {
    throw new DomainError("NOT_FOUND", "Team nicht gefunden.");
  }
  if (team.bannedAt) {
    throw new DomainError("FORBIDDEN", TEAM_BANNED);
  }
  if (team.captainId !== user.id) {
    throw new DomainError("FORBIDDEN", "Nur der Captain darf das.");
  }
  return { user, team };
}

/** requireCaptain plus the captain is verified: needed for all scrim actions. */
export async function requireActingCaptain(
  userId: string | null | undefined,
  teamId: string,
  db: Db = prisma,
) {
  const result = await requireCaptain(userId, teamId, db);
  if (!result.user.verifiedAt) {
    throw new DomainError("NOT_VERIFIED", CAPTAIN_NOT_VERIFIED);
  }
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
  if (!(await isTeamReady(teamId, db))) {
    throw new DomainError("FORBIDDEN", "Das Team hat noch keine 5 verifizierten Mitglieder.");
  }
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
 * Non-throwing counterpart of requireActingCaptain for pages, so they only offer scrim actions
 * the user may run: null if allowed, otherwise the reason to show instead.
 */
export function actingCaptainProblem(
  user: { id: string; verifiedAt: Date | null },
  team: { captainId: string; bannedAt: Date | null },
): string | null {
  if (team.bannedAt) return TEAM_BANNED;
  if (team.captainId !== user.id) return "Das kann nur euer Captain.";
  if (!user.verifiedAt) return CAPTAIN_NOT_VERIFIED;
  return null;
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
