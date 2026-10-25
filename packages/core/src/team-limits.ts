// Requests for more teams (SPEC N-17, ARCHITECTURE §5.20): a user asks on the support page, an
// admin or the operator raises the user's team limit or rejects. No message, the support page shows
// the state.
import { TeamLimitStatus, prisma } from "@uni-scrims/db";
import { z } from "zod";
import { DomainError } from "./errors.ts";
import { lockUser } from "./locks.ts";
import { requireAdmin, requireUser } from "./permissions.ts";
import { parseInput } from "./schemas.ts";
import { countOwnTeams } from "./teams.ts";

export const TEAM_LIMIT_REASON_MIN = 10;
export const TEAM_LIMIT_REASON_MAX = 500;
/** The highest limit an admin can set. */
export const MAX_TEAM_LIMIT = 50;

export const teamLimitReasonSchema = z
  .string("Bitte begründe deinen Antrag.")
  .trim()
  .min(
    TEAM_LIMIT_REASON_MIN,
    `Bitte begründe deinen Antrag mit mindestens ${TEAM_LIMIT_REASON_MIN} Zeichen.`,
  )
  .max(
    TEAM_LIMIT_REASON_MAX,
    `Die Begründung darf höchstens ${TEAM_LIMIT_REASON_MAX} Zeichen haben.`,
  );

function pendingConflict(): DomainError {
  return new DomainError("CONFLICT", "Du hast schon einen offenen Antrag.");
}

/** Asks for more teams; one open request per user (pendingUserId). */
export async function submitTeamLimitRequest(input: { userId: string; reason: string; now: Date }) {
  const user = await requireUser(input.userId);
  const reason = parseInput(teamLimitReasonSchema, input.reason);
  await prisma.$transaction(async (tx) => {
    // The user row first, so a deletion or ban that commits meanwhile is seen below (§4).
    await lockUser(tx, user.id);
    await requireUser(user.id, tx);
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
  return { teamCount, teamLimit: user.teamLimit, latest };
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
    if (!request) throw new DomainError("NOT_FOUND", "Antrag nicht gefunden.");
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
      throw new DomainError("CONFLICT", "Dieser Antrag ist bereits entschieden.");
    }
    if (newLimit !== null) {
      await tx.user.update({ where: { id: request.userId }, data: { teamLimit: newLimit } });
    }
  });
}

function parseNewLimit(value: number | null | undefined, current: number): number {
  const message = `Bitte gib ein neues Limit zwischen ${current + 1} und ${MAX_TEAM_LIMIT} an.`;
  const schema = z
    .number(message)
    .int(message)
    .min(current + 1, message)
    .max(MAX_TEAM_LIMIT, message);
  return parseInput(schema, value);
}
