// Requests for more teams (SPEC N-17, ARCHITECTURE §5.20): a user asks on the support page, an
// admin or the operator raises the user's team limit or rejects. No message, the support page shows
// the state.
import { TeamLimitStatus, prisma } from "@uni-scrims/db";
import { z } from "zod";
import { MAX_TEAM_LIMIT, TEAM_LIMIT_REASON_MAX, TEAM_LIMIT_REASON_MIN } from "../config/limits.ts";
import { DomainError } from "./errors.ts";
import { key, msg } from "./i18n/render.ts";
import { lockUser } from "./locks.ts";
import { requireAdmin, requireUser } from "./permissions.ts";
import { parseInput } from "./schemas.ts";
import { countOwnTeams } from "./teams.ts";

export { MAX_TEAM_LIMIT, TEAM_LIMIT_REASON_MAX, TEAM_LIMIT_REASON_MIN };

export const teamLimitReasonSchema = z
  .string(key("teamLimitReasonMissing"))
  .trim()
  .min(TEAM_LIMIT_REASON_MIN, key("teamLimitReasonTooShort"))
  .max(TEAM_LIMIT_REASON_MAX, key("teamLimitReasonTooLong"));

function pendingConflict(): DomainError {
  return new DomainError("CONFLICT", "teamLimitPending");
}

/** No admin could approve more (decideTeamLimitRequest), so no request is taken. */
const AT_MAX = msg("teamLimitAtMax");

/** Asks for more teams; one open request per user (pendingUserId). */
export async function submitTeamLimitRequest(input: { userId: string; reason: string; now: Date }) {
  const user = await requireUser(input.userId);
  const reason = parseInput(teamLimitReasonSchema, input.reason);
  await prisma.$transaction(async (tx) => {
    // The user row first, so a deletion or ban that commits meanwhile is seen below (§4).
    await lockUser(tx, user.id);
    const locked = await requireUser(user.id, tx);
    if (locked.teamLimit >= MAX_TEAM_LIMIT) throw new DomainError("CONFLICT", AT_MAX);
    if (await tx.teamLimitRequest.findUnique({ where: { pendingUserId: user.id } })) {
      throw pendingConflict();
    }
    await tx.teamLimitRequest.create({
      data: {
        userId: user.id,
        pendingUserId: user.id,
        reason,
        status: TeamLimitStatus.PENDING,
        createdAt: input.now,
      },
    });
  });
}

/** The support page: how many teams of how many, and the open or the latest request. */
export async function getTeamLimitStatus(userId: string) {
  const user = await requireUser(userId);
  const [teamCount, latest] = await Promise.all([
    countOwnTeams(user.id),
    prisma.teamLimitRequest.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true, createdAt: true, decidedAt: true, newLimit: true },
    }),
  ]);
  return {
    teamCount,
    teamLimit: user.teamLimit,
    latest,
    /** null while a request can be made, else why not (at the highest limit). */
    requestProblem: user.teamLimit >= MAX_TEAM_LIMIT ? AT_MAX : null,
  };
}

/** Open requests for the admin page „Anträge“, the oldest first. */
export async function listTeamLimitRequests(adminId: string) {
  await requireAdmin(adminId);
  const requests = await prisma.teamLimitRequest.findMany({
    where: { status: TeamLimitStatus.PENDING },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      reason: true,
      createdAt: true,
      user: { select: { id: true, name: true, teamLimit: true } },
    },
  });
  const teamCounts = await Promise.all(requests.map(({ user }) => countOwnTeams(user.id)));
  return requests.map((request, index) => ({
    id: request.id,
    reason: request.reason,
    createdAt: request.createdAt,
    userId: request.user.id,
    userName: request.user.name,
    teamCount: teamCounts[index]!,
    teamLimit: request.user.teamLimit,
  }));
}

/** Raises the limit to `newLimit` (above the current one, at most MAX_TEAM_LIMIT) or rejects. */
export async function decideTeamLimitRequest(input: {
  adminId: string;
  requestId: string;
  decision: "APPROVED" | "REJECTED";
  newLimit?: number | null;
  now: Date;
}): Promise<void> {
  await requireAdmin(input.adminId);
  const approved = input.decision === "APPROVED";
  await prisma.$transaction(async (tx) => {
    const request = await tx.teamLimitRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new DomainError("NOT_FOUND", "teamLimitRequestNotFound");
    // Both user rows by id, as in decideVerification: an admin who deletes the account meanwhile
    // is not stored as decidedById, and the user's limit is read under the lock.
    for (const id of [...new Set([request.userId, input.adminId])].sort()) await lockUser(tx, id);
    await requireAdmin(input.adminId, tx);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: request.userId },
      select: { teamLimit: true },
    });
    const newLimit = approved ? parseNewLimit(input.newLimit, user.teamLimit) : null;
    const updated = await tx.teamLimitRequest.updateMany({
      where: { id: request.id, status: TeamLimitStatus.PENDING },
      data: {
        status: approved ? TeamLimitStatus.APPROVED : TeamLimitStatus.REJECTED,
        newLimit,
        decidedAt: input.now,
        decidedById: input.adminId,
        pendingUserId: null,
      },
    });
    if (updated.count === 0) {
      throw new DomainError("CONFLICT", "teamLimitRequestDecided");
    }
    if (newLimit !== null) {
      await tx.user.update({ where: { id: request.userId }, data: { teamLimit: newLimit } });
    }
  });
}

function parseNewLimit(value: number | null | undefined, current: number): number {
  // The lower bound depends on the user, so the message gets it as a parameter.
  const parsed = z
    .number()
    .int()
    .min(current + 1)
    .max(MAX_TEAM_LIMIT)
    .safeParse(value);
  if (!parsed.success) {
    throw new DomainError("INVALID", msg("newLimitRange", { min: current + 1 }));
  }
  return parsed.data;
}
