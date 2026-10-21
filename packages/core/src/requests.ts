// Scrim requests and applications (SPEC P0-4, P0-5, ARCHITECTURE §5.3, §5.4).
// apply, delete, confirm and expire lock the request row first, so they run one after another.
import {
  AppStatus,
  NotifChannel,
  NotifType,
  type Prisma,
  RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { TIMING } from "../config/timing.ts";
import { type Db, isUniqueViolation } from "./db.ts";
import { DomainError, type Problem, problemError } from "./errors.ts";
import { lockRequest, lockTeam } from "./locks.ts";
import {
  BOTH_TEAM_CHANNELS,
  type NotificationEntry,
  forTeam,
  queueNotifications,
} from "./notifications.ts";
import {
  actingCaptainProblem,
  requireActingCaptain,
  requireOwnActingCaptain,
  requireTeamMember,
  requireTeamReady,
  teamReadyProblem,
} from "./permissions.ts";
import { isRankInRange } from "./ranks.ts";
import {
  type RequestInput,
  applicationMessageSchema,
  parseInput,
  requestInputSchema,
} from "./schemas.ts";
import { READY_MEMBER_COUNT, isTeamActive, isTeamReady } from "./readiness.ts";
import { berlinToUtc } from "./time.ts";

/** Max. open requests per team (SPEC P0-4). */
export const MAX_OPEN_REQUESTS = 5;

function notOpen(): DomainError {
  return new DomainError("CONFLICT", "Die Anfrage ist nicht mehr offen.");
}

function requestNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "Anfrage nicht gefunden.");
}

/** Open = OPEN and not started yet: only open requests take applications and count to the limit. */
export function isRequestOpen(
  request: { status: RequestStatus; startsAt: Date },
  now: Date,
): boolean {
  return request.status === RequestStatus.OPEN && request.startsAt > now;
}

/** isRequestOpen as a Prisma filter. */
export function openRequestWhere(now: Date) {
  return {
    status: RequestStatus.OPEN,
    startsAt: { gt: now },
  } satisfies Prisma.ScrimRequestWhereInput;
}

const REQUEST_LIMIT: Problem = {
  kind: "REQUEST_LIMIT",
  code: "CONFLICT",
  message: `Ihr habt schon ${MAX_OPEN_REQUESTS} offene Anfragen. Löscht erst eine.`,
};

/**
 * Why the team cannot post another request now, or null (SPEC P0-4). db is required on purpose:
 * in createRequest the count is only safe on the transaction that holds the team lock.
 */
export async function openRequestLimitProblem(
  teamId: string,
  now: Date,
  db: Db,
): Promise<Problem | null> {
  const open = await db.scrimRequest.count({ where: { teamId, ...openRequestWhere(now) } });
  return open >= MAX_OPEN_REQUESTS ? REQUEST_LIMIT : null;
}

/**
 * Every reason why createRequest fails regardless of the input, in this order. Under the team
 * lock createRequest throws the first one; getRequestForm shows them all (§7).
 */
export async function requestPostingProblems(
  user: { id: string; verifiedAt: Date | null },
  team: { id: string; captainId: string; bannedAt: Date | null },
  now: Date,
  db: Db,
): Promise<Problem[]> {
  const captain = actingCaptainProblem(user, team);
  // A ban or another captain settles it; an unverified captain also learns what else is missing.
  if (captain && captain.kind !== "CAPTAIN_NOT_VERIFIED") return [captain];
  // In parallel for getRequestForm; on createRequest's transaction both counts share its single
  // connection and run one after the other.
  const [ready, full] = await Promise.all([
    isTeamReady(team.id, db),
    openRequestLimitProblem(team.id, now, db),
  ]);
  return [captain, teamReadyProblem(ready), full].filter((problem) => problem !== null);
}

/**
 * Why the applicant team cannot be booked, or null: it must be active and ready (SPEC P0-5).
 * Pure, for teams whose members are loaded; findApplicantTeamProblem reads readiness from the db.
 */
export function applicantTeamProblem(
  team: { name: string; bannedAt: Date | null; dissolvedAt: Date | null },
  ready: boolean,
): string | null {
  if (!isTeamActive(team)) return `Das Team „${team.name}“ ist nicht mehr aktiv.`;
  if (!ready) {
    return `Das Team „${team.name}“ ist nicht mehr spielbereit (weniger als ${READY_MEMBER_COUNT} verifizierte Mitglieder).`;
  }
  return null;
}

/** applicantTeamProblem against the database; readiness is only counted for active teams. */
export async function findApplicantTeamProblem(
  team: { id: string; name: string; bannedAt: Date | null; dissolvedAt: Date | null },
  db: Db,
): Promise<string | null> {
  return applicantTeamProblem(team, isTeamActive(team) && (await isTeamReady(team.id, db)));
}

export async function createRequest(input: RequestInput & { userId: string; now: Date }) {
  return prisma.$transaction(async (tx) => {
    const { user, team } = await requireOwnActingCaptain(input.userId, tx);
    const data = parseInput(requestInputSchema, input);
    const startsAt = berlinToUtc(data.date, data.time);
    if (startsAt.getTime() < input.now.getTime() + TIMING.MIN_REQUEST_LEAD) {
      const minutes = Math.round(TIMING.MIN_REQUEST_LEAD / 60_000);
      throw new DomainError(
        "INVALID",
        `Die Startzeit muss mindestens ${minutes} Minuten in der Zukunft liegen.`,
      );
    }
    // Team lock: parallel creates must not exceed the limit. User and team are re-read under the
    // lock (the role, the ban or the members may have changed while we waited); from here on
    // requestPostingProblems alone decides.
    await lockTeam(tx, team.id);
    const current = await requireTeamMember(user.id, team.id, tx);
    const [problem] = await requestPostingProblems(current.user, current.team, input.now, tx);
    if (problem) throw problemError(problem);
    return tx.scrimRequest.create({
      data: {
        teamId: team.id,
        createdById: user.id,
        game: team.game,
        startsAt,
        format: data.format,
        rankMin: data.rankMin,
        rankMax: data.rankMax,
        maps: data.maps,
        note: data.note,
        status: RequestStatus.OPEN,
        createdAt: input.now,
      },
    });
  });
}

type RequestForClosing = { id: string; startsAt: Date; team: { name: string } };

/**
 * OPEN → CANCELLED or EXPIRED; pending applications are rejected and their teams notified.
 * The caller holds the request lock. Returns false if the request was no longer open.
 */
export async function closeOpenRequest(
  tx: Prisma.TransactionClient,
  request: RequestForClosing,
  status: typeof RequestStatus.CANCELLED | typeof RequestStatus.EXPIRED,
  now: Date,
): Promise<boolean> {
  const updated = await tx.scrimRequest.updateMany({
    where: { id: request.id, status: RequestStatus.OPEN },
    data: { status },
  });
  if (updated.count === 0) return false;
  // Only the rows actually rejected here: an application withdrawn meanwhile gets no notice.
  const rejected = await tx.application.updateManyAndReturn({
    where: { requestId: request.id, status: AppStatus.PENDING },
    data: { status: AppStatus.REJECTED, decidedAt: now },
    select: { teamId: true },
  });
  const type =
    status === RequestStatus.CANCELLED ? NotifType.REQUEST_DELETED : NotifType.REQUEST_EXPIRED;
  await queueNotifications(
    tx,
    now,
    rejected.map((application) => ({
      type,
      channel: NotifChannel.CAPTAIN_DM,
      entityId: request.id,
      targetTeamId: application.teamId,
      requestId: request.id,
      payload: { teamName: request.team.name, startsAt: request.startsAt.toISOString() },
    })),
  );
  return true;
}

/** Only the creating team, only while open (SPEC P0-4). */
export async function deleteRequest(input: {
  userId: string;
  requestId: string;
  now: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockRequest(tx, input.requestId);
    const request = await tx.scrimRequest.findUnique({
      where: { id: input.requestId },
      include: { team: { select: { name: true } } },
    });
    if (!request) throw requestNotFound();
    await requireActingCaptain(input.userId, request.teamId, tx);
    if (!isRequestOpen(request, input.now)) throw notOpen();
    await closeOpenRequest(tx, request, RequestStatus.CANCELLED, input.now);
  });
}

/** Sweeper: requests without a confirmed application expire at their start time. */
export async function expireRequests(now: Date): Promise<number> {
  const due = await prisma.scrimRequest.findMany({
    where: { status: RequestStatus.OPEN, startsAt: { lte: now } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of due) {
    const changed = await prisma.$transaction(async (tx) => {
      await lockRequest(tx, id);
      const request = await tx.scrimRequest.findUniqueOrThrow({
        where: { id },
        include: { team: { select: { name: true } } },
      });
      if (request.startsAt > now) return false;
      return closeOpenRequest(tx, request, RequestStatus.EXPIRED, now);
    });
    if (changed) expired++;
  }
  return expired;
}

export async function applyToRequest(input: {
  userId: string;
  requestId: string;
  message?: string | null;
  now: Date;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockRequest(tx, input.requestId);
      const request = await tx.scrimRequest.findUnique({ where: { id: input.requestId } });
      if (!request) throw requestNotFound();
      const { team } = await requireOwnActingCaptain(input.userId, tx);
      const message = parseInput(applicationMessageSchema, input.message);
      if (team.id === request.teamId) {
        throw new DomainError("INVALID", "Ihr könnt euch nicht auf eure eigene Anfrage bewerben.");
      }
      if (!isRequestOpen(request, input.now)) throw notOpen();
      await requireTeamReady(team.id, tx);
      const existing = await tx.application.findUnique({
        where: { requestId_teamId: { requestId: request.id, teamId: team.id } },
      });
      if (existing) throw alreadyApplied();
      const application = await tx.application.create({
        data: {
          requestId: request.id,
          teamId: team.id,
          message,
          status: AppStatus.PENDING,
          createdAt: input.now,
        },
      });
      await queueNotifications(tx, input.now, [
        {
          type: NotifType.APPLICATION_RECEIVED,
          channel: NotifChannel.CAPTAIN_DM,
          entityId: application.id,
          targetTeamId: request.teamId,
          requestId: request.id,
          payload: { teamName: team.name, startsAt: request.startsAt.toISOString() },
        },
      ]);
      // Outside the rank range is allowed; the UI shows a hint (SPEC P0-5).
      return {
        application,
        outOfRange: !isRankInRange(team.rank, request.rankMin, request.rankMax),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyApplied();
    throw error;
  }
}

function alreadyApplied(): DomainError {
  return new DomainError("CONFLICT", "Ihr habt euch auf diese Anfrage schon beworben.");
}

/** PENDING → WITHDRAWN. The team cannot apply to the same request again. */
export async function withdrawApplication(input: {
  userId: string;
  applicationId: string;
  now: Date;
}): Promise<void> {
  const application = await prisma.application.findUnique({ where: { id: input.applicationId } });
  if (!application) {
    throw new DomainError("NOT_FOUND", "Bewerbung nicht gefunden.");
  }
  await requireActingCaptain(input.userId, application.teamId);
  const updated = await prisma.application.updateMany({
    where: { id: application.id, status: AppStatus.PENDING },
    data: { status: AppStatus.WITHDRAWN, decidedAt: input.now },
  });
  if (updated.count === 0) {
    throw new DomainError("CONFLICT", "Die Bewerbung ist nicht mehr offen.");
  }
}

/**
 * Books the scrim atomically (ARCHITECTURE §5.4). Only the first of two parallel confirmations
 * wins; if a team is no longer ready or active, the application stays pending.
 */
export async function confirmApplication(input: {
  userId: string;
  requestId: string;
  applicationId: string;
  now: Date;
}) {
  const { now } = input;
  return prisma.$transaction(async (tx) => {
    await lockRequest(tx, input.requestId);
    const request = await tx.scrimRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw requestNotFound();
    const { team: host } = await requireActingCaptain(input.userId, request.teamId, tx);
    const application = await tx.application.findUnique({
      where: { id: input.applicationId },
      include: { team: true },
    });
    if (!application || application.requestId !== request.id) {
      throw new DomainError("NOT_FOUND", "Bewerbung nicht gefunden.");
    }
    if (!isRequestOpen(request, now)) throw notOpen();
    if (application.status !== AppStatus.PENDING) {
      throw new DomainError("CONFLICT", "Die Bewerbung ist nicht mehr offen.");
    }
    await requireTeamReady(host.id, tx);
    const guest = application.team;
    const guestProblem = await findApplicantTeamProblem(guest, tx);
    if (guestProblem) throw new DomainError("CONFLICT", guestProblem);

    const booked = await tx.scrimRequest.updateMany({
      where: { id: request.id, ...openRequestWhere(now) },
      data: { status: RequestStatus.BOOKED },
    });
    if (booked.count === 0) throw notOpen();
    const accepted = await tx.application.updateMany({
      where: { id: application.id, requestId: request.id, status: AppStatus.PENDING },
      data: { status: AppStatus.ACCEPTED, decidedAt: now },
    });
    if (accepted.count === 0) {
      throw new DomainError("CONFLICT", "Die Bewerbung ist nicht mehr offen.");
    }
    // Only the rows actually rejected here: an application withdrawn meanwhile gets no notice.
    const rejected = await tx.application.updateManyAndReturn({
      where: { requestId: request.id, status: AppStatus.PENDING },
      data: { status: AppStatus.REJECTED, decidedAt: now },
      select: { id: true, teamId: true },
    });

    const feedbackOpensAt = new Date(request.startsAt.getTime() + TIMING.FEEDBACK_OFFSET);
    const scrim = await tx.scrim.create({
      data: {
        requestId: request.id,
        hostTeamId: host.id,
        guestTeamId: guest.id,
        startsAt: request.startsAt,
        format: request.format,
        maps: request.maps,
        feedbackOpensAt,
        feedbackDeadline: new Date(feedbackOpensAt.getTime() + TIMING.FEEDBACK_WINDOW),
        status: ScrimStatus.SCHEDULED,
        createdAt: now,
      },
    });

    const startsAt = request.startsAt.toISOString();
    const sides = [
      { teamId: host.id, opponentTeamName: guest.name },
      { teamId: guest.id, opponentTeamName: host.name },
    ];
    const toBothTeams = (type: NotifType, scheduledFor?: Date): NotificationEntry[] =>
      sides.flatMap((side) =>
        forTeam(side.teamId, BOTH_TEAM_CHANNELS, {
          type,
          entityId: scrim.id,
          scrimId: scrim.id,
          scheduledFor,
          payload: { opponentTeamName: side.opponentTeamName, startsAt, format: scrim.format },
        }),
      );
    const [before24h, before1h] = TIMING.REMINDER_OFFSETS;
    const reminders = [
      { type: NotifType.REMINDER_24H, at: new Date(request.startsAt.getTime() - before24h) },
      { type: NotifType.REMINDER_1H, at: new Date(request.startsAt.getTime() - before1h) },
    ].filter((reminder) => reminder.at > now);

    await queueNotifications(tx, now, [
      ...toBothTeams(NotifType.SCRIM_BOOKED),
      ...rejected.map((other) => ({
        type: NotifType.APPLICATION_REJECTED,
        channel: NotifChannel.CAPTAIN_DM,
        entityId: other.id,
        targetTeamId: other.teamId,
        requestId: request.id,
        payload: { teamName: host.name, startsAt },
      })),
      ...reminders.flatMap((reminder) => toBothTeams(reminder.type, reminder.at)),
      ...toBothTeams(NotifType.FEEDBACK_PROMPT, feedbackOpensAt),
    ]);
    return scrim;
  });
}
