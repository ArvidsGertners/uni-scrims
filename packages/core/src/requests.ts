// Scrim requests and applications (SPEC P0-4, P0-5, ARCHITECTURE §5.3, §5.4).
// apply, delete, confirm and expire lock the request row, so they run one after another; apply locks
// the applicant's team and confirm both teams before it (lock order in ARCHITECTURE §4).
import {
  AppStatus,
  NotifChannel,
  NotifType,
  type Prisma,
  RequestStatus,
  type ScrimFormat,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { MAX_OPEN_REQUESTS } from "../config/limits.ts";
import { TIMING } from "../config/timing.ts";
import { type Db, isUniqueViolation } from "./db.ts";
import { DomainError, type Problem, problemError } from "./errors.ts";
import { type Message, msg } from "./i18n/render.ts";
import { lockRequest, lockTeam, lockTeams } from "./locks.ts";
import {
  BOTH_TEAM_CHANNELS,
  type NotificationEntry,
  forTeam,
  queueNotifications,
} from "./notifications.ts";
import {
  captainProblem,
  captainVerificationProblem,
  requireActingCaptain,
  requireTeamMember,
} from "./permissions.ts";
import { RANKS, isOutsideRange, loadTeamRank } from "./ranks.ts";
import {
  type RequestInput,
  applicationMessageSchema,
  parseInput,
  requestInputSchema,
} from "./schemas.ts";
import { activeTeamWhere, isTeamActive, isTeamFullyVerified } from "./readiness.ts";
import { addBerlinWeeks, berlinToUtc, daysBetweenDates } from "./time.ts";

export { MAX_OPEN_REQUESTS };

function notOpen(): DomainError {
  return new DomainError("CONFLICT", "requestNotOpen");
}

function requestNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "requestNotFound");
}

/**
 * Less than MIN_REQUEST_LEAD before the start: too late to post a request for it, by hand or by a
 * series (§5.27).
 */
export function isStartTooSoon(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() < now.getTime() + TIMING.MIN_REQUEST_LEAD;
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

/**
 * The requests the board shows, signed in or not: open ones of active teams (SPEC P0-4, N-24), no
 * direct requests (SPEC N-26). The public logos follow the same rule (§5.26).
 */
export function boardRequestWhere(now: Date) {
  return {
    ...openRequestWhere(now),
    targetTeamId: null,
    team: activeTeamWhere(),
  } satisfies Prisma.ScrimRequestWhereInput;
}

/** Direct requests have no rank range; they store the whole range (§5.28). */
const DIRECT_REQUEST_RANKS = { rankMin: RANKS[0]!, rankMax: RANKS[RANKS.length - 1]! };

/**
 * Why `ownTeamId` cannot send a direct request to the target, or null (SPEC N-26): the target must
 * exist, be active and be another team. Hidden teams (Team.listed) can be requested.
 */
export function directRequestTargetProblem(
  ownTeamId: string | null,
  target: { id: string; bannedAt: Date | null; dissolvedAt: Date | null } | null,
): DomainError | null {
  if (!target || !isTeamActive(target)) return new DomainError("NOT_FOUND", "targetTeamNotFound");
  if (target.id === ownTeamId) return new DomainError("INVALID", "ownTeamTarget");
  return null;
}

/** The target team of a new direct request, or throws directRequestTargetProblem. */
async function requireDirectRequestTarget(ownTeamId: string, targetTeamId: string, db: Db) {
  const target = await db.team.findUnique({
    where: { id: targetTeamId },
    select: { id: true, name: true, bannedAt: true, dissolvedAt: true },
  });
  const problem = directRequestTargetProblem(ownTeamId, target);
  if (problem) throw problem;
  return target!;
}

const REQUEST_LIMIT: Problem = {
  kind: "REQUEST_LIMIT",
  code: "CONFLICT",
  text: msg("requestLimit"),
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
 * Why createRequest fails regardless of the input, in actingCaptainProblem's order followed by the
 * limit. A ban or another captain settles it alone; an unverified captain also learns whether the
 * limit is reached. Under the team lock createRequest throws the first entry; getRequestForm shows
 * the list (§7). Since Phase 25 the number of verified players does not matter (SPEC N-21).
 */
export async function requestPostingProblems(
  user: { id: string; verifiedAt: Date | null },
  team: { id: string; captainId: string; bannedAt: Date | null },
  now: Date,
  db: Db,
): Promise<Problem[]> {
  const blocking = captainProblem(user, team);
  if (blocking) return [blocking];
  const full = await openRequestLimitProblem(team.id, now, db);
  return [captainVerificationProblem(user), full].filter((problem) => problem !== null);
}

/**
 * Why a team without the badge cannot apply to the host team's requests, or null: the host admits
 * only fully verified teams (SPEC N-21).
 */
export function applicantRuleProblem(
  host: { name: string; verifiedApplicantsOnly: boolean },
  fullyVerified: boolean,
): Message | null {
  return host.verifiedApplicantsOnly && !fullyVerified
    ? msg("applicantsMustBeFullyVerified", { team: host.name })
    : null;
}

/**
 * Why the applicant team cannot be booked, or null: it must be active, and fully verified if the
 * host team admits only such teams (SPEC P0-5, N-21). Pure, for teams whose members are loaded;
 * findApplicantTeamProblem counts in the db.
 */
export function applicantTeamProblem(
  team: { name: string; bannedAt: Date | null; dissolvedAt: Date | null },
  badge: { required: boolean; fullyVerified: boolean },
): Message | null {
  if (!isTeamActive(team)) return msg("applicantTeamInactive", { team: team.name });
  if (badge.required && !badge.fullyVerified) {
    return msg("applicantTeamNotFullyVerified", { team: team.name });
  }
  return null;
}

/** applicantTeamProblem against the database; the players are only counted when it matters. */
export async function findApplicantTeamProblem(
  team: { id: string; name: string; bannedAt: Date | null; dissolvedAt: Date | null },
  db: Db,
  required: boolean,
): Promise<Message | null> {
  const fullyVerified = required && isTeamActive(team) && (await isTeamFullyVerified(team.id, db));
  return applicantTeamProblem(team, { required, fullyVerified });
}

/**
 * Posts a request for `teamId`, the team the form was shown for (§5.20). With `repeatUntil` it is
 * the first date of a weekly series, created in the same transaction (SPEC N-25, §5.27). With
 * `targetTeamId` it is a direct request to that team, without a rank range; `repeatUntil` then only
 * proposes a fixed partnership, which accepting creates (SPEC N-26, §5.28).
 */
export async function createRequest(
  input: Omit<RequestInput, "rankMin" | "rankMax"> &
    Partial<Pick<RequestInput, "rankMin" | "rankMax">> & {
      userId: string;
      teamId: string;
      targetTeamId?: string | null;
      now: Date;
    },
) {
  return prisma.$transaction(async (tx) => {
    const { user, team } = await requireActingCaptain(input.userId, input.teamId, tx);
    const targetTeamId = input.targetTeamId || null;
    const data = parseInput(
      requestInputSchema,
      targetTeamId ? { ...input, ...DIRECT_REQUEST_RANKS } : input,
    );
    const startsAt = berlinToUtc(data.date, data.time);
    if (isStartTooSoon(startsAt, input.now)) {
      const minutes = Math.round(TIMING.MIN_REQUEST_LEAD / 60_000);
      throw new DomainError("INVALID", msg("startTooSoon", { minutes }));
    }
    // Before the locks, so a captain only ever holds an existing, active other team.
    if (targetTeamId) await requireDirectRequestTarget(team.id, targetTeamId, tx);
    // Team lock: parallel creates must not exceed the limit. User and team are re-read under the
    // lock (the role, the ban or the members may have changed while we waited); from here on
    // requestPostingProblems alone decides. A direct request also holds the target (§5.28): a ban
    // of it either commits first (seen below) or waits and then cancels this request.
    await lockTeams(tx, targetTeamId ? [team.id, targetTeamId] : [team.id]);
    const current = await requireTeamMember(user.id, team.id, tx);
    const [problem] = await requestPostingProblems(current.user, current.team, input.now, tx);
    if (problem) throw problemError(problem);
    const target = targetTeamId
      ? await requireDirectRequestTarget(team.id, targetTeamId, tx)
      : null;
    // The schema allows 7 days up to SERIES_MAX_WEEKS weeks, so there are 1 to 16 more dates.
    const lastStartsAt = data.repeatUntil
      ? addBerlinWeeks(startsAt, Math.floor(daysBetweenDates(data.date, data.repeatUntil) / 7))
      : null;
    const fields = {
      teamId: team.id,
      createdById: user.id,
      game: team.game,
      format: data.format,
      rankMin: data.rankMin,
      rankMax: data.rankMax,
      maps: data.maps,
      note: data.note,
    };
    if (target) {
      const request = await tx.scrimRequest.create({
        data: {
          ...fields,
          startsAt,
          targetTeamId: target.id,
          weeklyLastStartsAt: lastStartsAt,
          status: RequestStatus.OPEN,
          createdAt: input.now,
        },
      });
      await queueNotifications(tx, input.now, [
        {
          type: NotifType.DIRECT_REQUEST_RECEIVED,
          channel: NotifChannel.PERSONAL,
          entityId: request.id,
          targetTeamId: target.id,
          requestId: request.id,
          payload: {
            teamName: team.name,
            startsAt: startsAt.toISOString(),
            format: request.format,
            weeklyUntil: lastStartsAt?.toISOString() ?? null,
          },
        },
      ]);
      return request;
    }
    const series = lastStartsAt
      ? await tx.requestSeries.create({
          data: {
            ...fields,
            nextStartsAt: addBerlinWeeks(startsAt, 1),
            lastStartsAt,
            createdAt: input.now,
          },
        })
      : null;
    return tx.scrimRequest.create({
      data: {
        ...fields,
        startsAt,
        seriesId: series?.id ?? null,
        status: RequestStatus.OPEN,
        createdAt: input.now,
      },
    });
  });
}

type RequestForClosing = {
  id: string;
  startsAt: Date;
  targetTeamId: string | null;
  team: { name: string };
};

/**
 * OPEN → CANCELLED or EXPIRED; pending applications are rejected and their teams notified. The
 * target of a cancelled direct request is notified like an applicant (§5.28); an expired one is not.
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
  const payload = { teamName: request.team.name, startsAt: request.startsAt.toISOString() };
  await queueNotifications(tx, now, [
    ...rejected.map((application) => ({
      type,
      channel: NotifChannel.PERSONAL,
      entityId: request.id,
      targetTeamId: application.teamId,
      requestId: request.id,
      payload,
    })),
    ...(status === RequestStatus.CANCELLED && request.targetTeamId
      ? [
          {
            type: NotifType.REQUEST_DELETED,
            channel: NotifChannel.PERSONAL,
            entityId: request.id,
            targetTeamId: request.targetTeamId,
            requestId: request.id,
            payload: { ...payload, direct: true },
          },
        ]
      : []),
  ]);
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

/** Applies as `teamId`, the team the request page was shown for (§5.20). */
export async function applyToRequest(input: {
  userId: string;
  teamId: string;
  requestId: string;
  message?: string | null;
  now: Date;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Own team before the request, as in retireTeamActivity (§4): a ban or dissolution of the
      // applicant team either commits first (seen below) or waits and then withdraws this application.
      const { team: ownTeam } = await requireActingCaptain(input.userId, input.teamId, tx);
      await lockTeam(tx, ownTeam.id);
      await lockRequest(tx, input.requestId);
      const request = await tx.scrimRequest.findUnique({ where: { id: input.requestId } });
      if (!request) throw requestNotFound();
      // Read again under the lock: role, ban, verification or membership may have changed meanwhile.
      const { team } = await requireActingCaptain(input.userId, ownTeam.id, tx);
      const message = parseInput(applicationMessageSchema, input.message);
      if (team.id === request.teamId) {
        throw new DomainError("INVALID", "ownRequest");
      }
      if (!isRequestOpen(request, input.now)) throw notOpen();
      // The host row is not locked: if its captain turns the setting on meanwhile, the application
      // may still be created, but confirmApplication checks again under both team locks (§5.24).
      const host = await tx.team.findUniqueOrThrow({
        where: { id: request.teamId },
        select: { name: true, verifiedApplicantsOnly: true },
      });
      const ruleProblem = applicantRuleProblem(
        host,
        host.verifiedApplicantsOnly && (await isTeamFullyVerified(team.id, tx)),
      );
      if (ruleProblem) throw new DomainError("FORBIDDEN", ruleProblem);
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
          channel: NotifChannel.PERSONAL,
          entityId: application.id,
          targetTeamId: request.teamId,
          requestId: request.id,
          payload: { teamName: team.name, startsAt: request.startsAt.toISOString() },
        },
      ]);
      // Outside the rank range is allowed; the UI shows a hint (SPEC P0-5).
      return {
        application,
        outOfRange: isOutsideRange(await loadTeamRank(team.id, tx), request),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyApplied();
    throw error;
  }
}

function alreadyApplied(): DomainError {
  return new DomainError("CONFLICT", "alreadyApplied");
}

/** PENDING → WITHDRAWN. The team cannot apply to the same request again. */
export async function withdrawApplication(input: {
  userId: string;
  applicationId: string;
  now: Date;
}): Promise<void> {
  const application = await prisma.application.findUnique({ where: { id: input.applicationId } });
  if (!application) {
    throw new DomainError("NOT_FOUND", "applicationNotFound");
  }
  await requireActingCaptain(input.userId, application.teamId);
  const updated = await prisma.application.updateMany({
    where: { id: application.id, status: AppStatus.PENDING },
    data: { status: AppStatus.WITHDRAWN, decidedAt: input.now },
  });
  if (updated.count === 0) {
    throw new DomainError("CONFLICT", "applicationNotOpen");
  }
}

/**
 * Books the scrim atomically (ARCHITECTURE §5.4). Only the first of two parallel confirmations
 * wins; if a team is no longer active, or the applicant lacks the badge the host requires, the
 * application stays pending.
 */
export async function confirmApplication(input: {
  userId: string;
  requestId: string;
  applicationId: string;
  now: Date;
}) {
  const { now } = input;
  return prisma.$transaction(async (tx) => {
    // Both teams before the request (§4), sorted by id: a ban or dissolution of either team either
    // commits first (seen by the checks below) or waits until the scrim is booked and cancels it.
    // Request and application keep their team for good, so the unlocked reads name the right rows.
    const unlockedRequest = await tx.scrimRequest.findUnique({
      where: { id: input.requestId },
      select: { teamId: true },
    });
    if (!unlockedRequest) throw requestNotFound();
    // Before any lock, so nobody but the host captain can hold the teams; checked again below.
    await requireActingCaptain(input.userId, unlockedRequest.teamId, tx);
    // Only an application to this request names a team to lock; any other ends as NOT_FOUND below.
    const unlockedApplication = await tx.application.findFirst({
      where: { id: input.applicationId, requestId: input.requestId },
      select: { teamId: true },
    });
    const teamIds = [unlockedRequest.teamId, unlockedApplication?.teamId]
      .filter((id): id is string => id !== undefined)
      .sort();
    for (const teamId of new Set(teamIds)) await lockTeam(tx, teamId);
    await lockRequest(tx, input.requestId);
    const request = await tx.scrimRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw requestNotFound();
    const { team: host } = await requireActingCaptain(input.userId, request.teamId, tx);
    const application = await tx.application.findUnique({
      where: { id: input.applicationId },
      include: { team: true },
    });
    if (!application || application.requestId !== request.id) {
      throw new DomainError("NOT_FOUND", "applicationNotFound");
    }
    if (!isRequestOpen(request, now)) throw notOpen();
    if (application.status !== AppStatus.PENDING) {
      throw new DomainError("CONFLICT", "applicationNotOpen");
    }
    const guest = application.team;
    const guestProblem = await findApplicantTeamProblem(guest, tx, host.verifiedApplicantsOnly);
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
      throw new DomainError("CONFLICT", "applicationNotOpen");
    }
    // Only the rows actually rejected here: an application withdrawn meanwhile gets no notice.
    const rejected = await tx.application.updateManyAndReturn({
      where: { requestId: request.id, status: AppStatus.PENDING },
      data: { status: AppStatus.REJECTED, decidedAt: now },
      select: { id: true, teamId: true },
    });

    const scrim = await createScrimBooking(tx, { request, host, guest, now });
    await queueNotifications(
      tx,
      now,
      rejected.map((other) => ({
        type: NotifType.APPLICATION_REJECTED,
        channel: NotifChannel.PERSONAL,
        entityId: other.id,
        targetTeamId: other.teamId,
        requestId: request.id,
        payload: { teamName: host.name, startsAt: request.startsAt.toISOString() },
      })),
    );
    return scrim;
  });
}

/**
 * Books the scrim of a request whose status the caller has just set to BOOKED (§5.4, §5.28): the
 * scrim row and, for both teams, SCRIM_BOOKED, the reminders still ahead and FEEDBACK_PROMPT. The
 * caller holds both team locks and the request lock, or has just created the request.
 */
export async function createScrimBooking(
  tx: Prisma.TransactionClient,
  input: {
    request: { id: string; startsAt: Date; format: ScrimFormat; maps: string[] };
    host: { id: string; name: string };
    guest: { id: string; name: string };
    now: Date;
  },
) {
  const { request, host, guest, now } = input;
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
  type ScrimNotifType =
    | typeof NotifType.SCRIM_BOOKED
    | typeof NotifType.REMINDER_24H
    | typeof NotifType.REMINDER_1H
    | typeof NotifType.FEEDBACK_PROMPT;
  const toBothTeams = (type: ScrimNotifType, scheduledFor?: Date): NotificationEntry[] =>
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
    ...reminders.flatMap((reminder) => toBothTeams(reminder.type, reminder.at)),
    ...toBothTeams(NotifType.FEEDBACK_PROMPT, feedbackOpensAt),
  ]);
  return scrim;
}
