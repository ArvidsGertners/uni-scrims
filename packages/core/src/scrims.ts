// Booked scrims: cancellation, feedback and outcome (SPEC Flow C, P0-6, P0-8, ARCHITECTURE §5.5, §5.6).
import {
  FeedbackOutcome,
  NotifType,
  type Prisma,
  type ScrimFormat,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { TIMING } from "../config/timing.ts";
import { isUniqueViolation } from "./db.ts";
import { DomainError } from "./errors.ts";
import { lockScrim } from "./locks.ts";
import {
  BOTH_TEAM_CHANNELS,
  cancelPendingScrimNotifications,
  forTeam,
  queueNotifications,
} from "./notifications.ts";
import { requireAdmin, requireScrimActingCaptain } from "./permissions.ts";
import { type FeedbackInput, feedbackInputSchema, parseInput } from "./schemas.ts";

function scrimNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "Scrim nicht gefunden.");
}

// Rules shared by the actions and the scrim page, so the page offers exactly what core allows.

/** Scheduled scrims can be cancelled until the start (Flow C). */
export function isCancellable(scrim: { status: ScrimStatus; startsAt: Date }, now: Date): boolean {
  return scrim.status === ScrimStatus.SCHEDULED && scrim.startsAt > now;
}

/** Under LATE_CANCEL before the start a cancellation counts as late (Flow C). */
export function isLateCancel(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() < TIMING.LATE_CANCEL;
}

/** Why no feedback can be given right now, or null: from the start until the deadline (§5.6). */
export function feedbackClosedReason(
  scrim: { status: ScrimStatus; startsAt: Date; feedbackDeadline: Date },
  now: Date,
): string | null {
  if (scrim.status === ScrimStatus.CANCELLED) return "Der Scrim wurde abgesagt.";
  if (scrim.status !== ScrimStatus.SCHEDULED && scrim.status !== ScrimStatus.AWAITING_FEEDBACK) {
    return "Feedback bereits abgeschlossen.";
  }
  if (now < scrim.startsAt) return "Feedback ist erst ab der Startzeit möglich.";
  if (now >= scrim.feedbackDeadline) return "Die Feedback-Frist ist abgelaufen.";
  return null;
}

type ScrimForCancel = {
  id: string;
  startsAt: Date;
  format: ScrimFormat;
  hostTeamId: string;
  guestTeamId: string;
  hostTeam: { name: string };
  guestTeam: { name: string };
};

/**
 * SCHEDULED → CANCELLED by one team; pending notifications of the scrim are dropped and the
 * other team is told. Returns false if the scrim was no longer cancellable.
 */
export async function cancelScheduledScrim(
  tx: Prisma.TransactionClient,
  scrim: ScrimForCancel,
  cancelledByTeamId: string,
  lateCancel: boolean,
  now: Date,
): Promise<boolean> {
  const updated = await tx.scrim.updateMany({
    where: { id: scrim.id, status: ScrimStatus.SCHEDULED, startsAt: { gt: now } },
    data: { status: ScrimStatus.CANCELLED, cancelledByTeamId, cancelledAt: now, lateCancel },
  });
  if (updated.count === 0) return false;
  await cancelPendingScrimNotifications(tx, scrim.id);
  const hostCancelled = cancelledByTeamId === scrim.hostTeamId;
  const otherTeamId = hostCancelled ? scrim.guestTeamId : scrim.hostTeamId;
  const cancellingTeamName = hostCancelled ? scrim.hostTeam.name : scrim.guestTeam.name;
  await queueNotifications(
    tx,
    now,
    forTeam(otherTeamId, BOTH_TEAM_CHANNELS, {
      type: NotifType.SCRIM_CANCELLED,
      entityId: scrim.id,
      scrimId: scrim.id,
      payload: {
        opponentTeamName: cancellingTeamName,
        startsAt: scrim.startsAt.toISOString(),
        format: scrim.format,
      },
    }),
  );
  return true;
}

const teamNames = {
  hostTeam: { select: { name: true } },
  guestTeam: { select: { name: true } },
} as const;

/** Either team until the start; under LATE_CANCEL before the start it counts as late (Flow C). */
export async function cancelScrim(input: { userId: string; scrimId: string; now: Date }) {
  return prisma.$transaction(async (tx) => {
    const scrim = await tx.scrim.findUnique({ where: { id: input.scrimId }, include: teamNames });
    if (!scrim) throw scrimNotFound();
    const { team } = await requireScrimActingCaptain(input.userId, scrim, tx);
    const lateCancel = isLateCancel(scrim.startsAt, input.now);
    if (!(await cancelScheduledScrim(tx, scrim, team.id, lateCancel, input.now))) {
      throw new DomainError("CONFLICT", "Der Scrim kann nicht mehr abgesagt werden.");
    }
    return { lateCancel };
  });
}

// ─── Outcome ──────────────────────────────────────────────────────────────────

export type FeedbackSide = { teamId: string; outcome: FeedbackOutcome | null };

export type ScrimOutcome = {
  status:
    | typeof ScrimStatus.COMPLETED
    | typeof ScrimStatus.NO_SHOW
    | typeof ScrimStatus.DISPUTED
    | typeof ScrimStatus.UNCONFIRMED;
  noShowTeamId: string | null;
};

const outcome = (status: ScrimOutcome["status"], noShowTeamId: string | null = null) => ({
  status,
  noShowTeamId,
});

/**
 * Pure evaluation of the table in ARCHITECTURE §5.6, symmetric in a and b.
 * null = keep waiting (one or no answer before the deadline).
 */
export function resolveScrimOutcome(
  a: FeedbackSide,
  b: FeedbackSide,
  deadlineReached: boolean,
): ScrimOutcome | null {
  if (a.outcome && b.outcome) {
    const outcomes = [a.outcome, b.outcome];
    const count = (value: FeedbackOutcome) => outcomes.filter((o) => o === value).length;
    if (count(FeedbackOutcome.PLAYED) === 2) return outcome(ScrimStatus.COMPLETED);
    if (count(FeedbackOutcome.PLAYED) === 1) return outcome(ScrimStatus.DISPUTED);
    if (count(FeedbackOutcome.OPPONENT_NO_SHOW) === 2) return outcome(ScrimStatus.DISPUTED);
    if (count(FeedbackOutcome.WE_COULD_NOT) === 2) return outcome(ScrimStatus.UNCONFIRMED);
    // One says "opponent did not show", the other "we could not": the latter did not show.
    const absent = a.outcome === FeedbackOutcome.WE_COULD_NOT ? a : b;
    return outcome(ScrimStatus.NO_SHOW, absent.teamId);
  }
  if (!deadlineReached) return null;
  const answered = a.outcome ? a : b.outcome ? b : null;
  if (!answered) return outcome(ScrimStatus.UNCONFIRMED);
  const silent = answered === a ? b : a;
  switch (answered.outcome) {
    case FeedbackOutcome.PLAYED:
      return outcome(ScrimStatus.COMPLETED);
    case FeedbackOutcome.OPPONENT_NO_SHOW:
      return outcome(ScrimStatus.NO_SHOW, silent.teamId);
    default:
      return outcome(ScrimStatus.NO_SHOW, answered.teamId);
  }
}

/** Reads both answers of a locked scrim, evaluates and writes the result if it is final. */
async function evaluate(
  tx: Prisma.TransactionClient,
  scrim: { id: string; hostTeamId: string; guestTeamId: string },
  deadlineReached: boolean,
): Promise<ScrimOutcome | null> {
  const feedback = await tx.scrimFeedback.findMany({
    where: { scrimId: scrim.id },
    select: { teamId: true, outcome: true },
  });
  const side = (teamId: string): FeedbackSide => ({
    teamId,
    outcome: feedback.find((entry) => entry.teamId === teamId)?.outcome ?? null,
  });
  const result = resolveScrimOutcome(
    side(scrim.hostTeamId),
    side(scrim.guestTeamId),
    deadlineReached,
  );
  if (!result) return null;
  const updated = await tx.scrim.updateMany({
    where: { id: scrim.id, status: ScrimStatus.AWAITING_FEEDBACK },
    data: { status: result.status, noShowTeamId: result.noShowTeamId },
  });
  return updated.count === 0 ? null : result;
}

/**
 * One answer per team, from the start time until the deadline; not changeable (§5.6).
 * After the deadline the sweeper evaluates, so late answers cannot change a result that is
 * already due.
 */
export async function submitFeedback(
  input: FeedbackInput & { userId: string; scrimId: string; now: Date },
) {
  const { now } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      await lockScrim(tx, input.scrimId);
      const scrim = await tx.scrim.findUnique({ where: { id: input.scrimId } });
      if (!scrim) throw scrimNotFound();
      const { user, team } = await requireScrimActingCaptain(input.userId, scrim, tx);
      const data = parseInput(feedbackInputSchema, {
        outcome: input.outcome,
        rating: input.rating,
      });
      const closed = feedbackClosedReason(scrim, now);
      if (closed) throw new DomainError("CONFLICT", closed);
      if (scrim.status === ScrimStatus.SCHEDULED) {
        await tx.scrim.update({
          where: { id: scrim.id },
          data: { status: ScrimStatus.AWAITING_FEEDBACK },
        });
      }
      const existing = await tx.scrimFeedback.findUnique({
        where: { scrimId_teamId: { scrimId: scrim.id, teamId: team.id } },
      });
      if (existing) throw alreadyAnswered();
      await tx.scrimFeedback.create({
        data: {
          scrimId: scrim.id,
          teamId: team.id,
          submittedById: user.id,
          outcome: data.outcome,
          rating: data.rating ?? null,
          createdAt: now,
        },
      });
      return { result: await evaluate(tx, scrim, false) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyAnswered();
    throw error;
  }
}

function alreadyAnswered(): DomainError {
  return new DomainError("CONFLICT", "Ihr habt schon geantwortet.");
}

/** Sweeper: feedback opens at feedbackOpensAt, independent of the prompt being delivered. */
export async function openFeedback(now: Date): Promise<number> {
  const updated = await prisma.scrim.updateMany({
    where: { status: ScrimStatus.SCHEDULED, feedbackOpensAt: { lte: now } },
    data: { status: ScrimStatus.AWAITING_FEEDBACK },
  });
  return updated.count;
}

/** Sweeper: scrims past their feedback deadline are evaluated with what is there. */
export async function resolveDeadlines(now: Date): Promise<number> {
  const due = await prisma.scrim.findMany({
    where: { status: ScrimStatus.AWAITING_FEEDBACK, feedbackDeadline: { lte: now } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  let resolved = 0;
  for (const { id } of due) {
    const result = await prisma.$transaction(async (tx) => {
      await lockScrim(tx, id);
      const scrim = await tx.scrim.findUniqueOrThrow({ where: { id } });
      if (scrim.status !== ScrimStatus.AWAITING_FEEDBACK || scrim.feedbackDeadline > now) {
        return null;
      }
      return evaluate(tx, scrim, true);
    });
    if (result) resolved++;
  }
  return resolved;
}

const disputeTeamSelect = {
  id: true,
  name: true,
  tag: true,
  captain: { select: { name: true } },
} satisfies Prisma.TeamSelect;

/**
 * Admin: open disputes, oldest first, with both answers. The current captains are shown so the
 * admin can contact them in Discord.
 */
export async function listDisputes(adminId: string) {
  await requireAdmin(adminId);
  const scrims = await prisma.scrim.findMany({
    where: { status: ScrimStatus.DISPUTED },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    include: {
      hostTeam: { select: disputeTeamSelect },
      guestTeam: { select: disputeTeamSelect },
      feedback: { select: { teamId: true, outcome: true, rating: true, createdAt: true } },
    },
  });
  return scrims.map((scrim) => {
    const side = (team: (typeof scrim)["hostTeam"]) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      captainName: team.captain.name,
      feedback: scrim.feedback.find((entry) => entry.teamId === team.id) ?? null,
    });
    return {
      id: scrim.id,
      startsAt: scrim.startsAt,
      format: scrim.format,
      maps: scrim.maps,
      host: side(scrim.hostTeam),
      guest: side(scrim.guestTeam),
    };
  });
}

export type DisputeDecision =
  { decision: "PLAYED" } | { decision: "NO_SHOW"; noShowTeamId: string } | { decision: "UNCLEAR" };

/** Admin decision on a dispute: played, no-show of one team, or unclear (= unconfirmed). */
export async function resolveDispute(
  input: DisputeDecision & { adminId: string; scrimId: string; now: Date },
): Promise<void> {
  await requireAdmin(input.adminId);
  await prisma.$transaction(async (tx) => {
    await lockScrim(tx, input.scrimId);
    const scrim = await tx.scrim.findUnique({ where: { id: input.scrimId } });
    if (!scrim) throw scrimNotFound();
    if (scrim.status !== ScrimStatus.DISPUTED) {
      throw new DomainError("CONFLICT", "Dieser Scrim ist kein offener Streitfall.");
    }
    let result: ScrimOutcome;
    if (input.decision === "PLAYED") {
      result = outcome(ScrimStatus.COMPLETED);
    } else if (input.decision === "UNCLEAR") {
      result = outcome(ScrimStatus.UNCONFIRMED);
    } else {
      if (input.noShowTeamId !== scrim.hostTeamId && input.noShowTeamId !== scrim.guestTeamId) {
        throw new DomainError("INVALID", "Das Team ist an diesem Scrim nicht beteiligt.");
      }
      result = outcome(ScrimStatus.NO_SHOW, input.noShowTeamId);
    }
    await tx.scrim.update({
      where: { id: scrim.id },
      data: {
        status: result.status,
        noShowTeamId: result.noShowTeamId,
        resolvedById: input.adminId,
        resolvedAt: input.now,
      },
    });
  });
}
