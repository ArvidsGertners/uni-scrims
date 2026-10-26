// Weekly recurring requests (SPEC N-25, ARCHITECTURE §5.27). A series keeps only its next date; the
// sweeper posts each date a week before its start, when the previous date starts, as soon as the
// team may post it, and drops the date once it is too close to its start. A fixed partnership
// (SPEC N-26, §5.28) is a series with a target team: the sweeper books its dates instead.
import { NotifChannel, NotifType, type Prisma, RequestStatus, prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeams, lockUser } from "./locks.ts";
import { queueNotifications } from "./notifications.ts";
import { captainVerificationProblem, isCaptainOf, requireActingCaptain } from "./permissions.ts";
import { isTeamActive } from "./readiness.ts";
import { createScrimBooking, isStartTooSoon, requestPostingProblems } from "./requests.ts";
import { addBerlinWeeks } from "./time.ts";

/**
 * When the request for a date of a series is posted: when the date a week before it starts, in
 * Berlin calendar weeks (so never two open requests of one series, also across a DST change).
 */
export function seriesPostsAt(startsAt: Date): Date {
  return addBerlinWeeks(startsAt, -1);
}

/**
 * The next date of the series that can still be posted: from nextStartsAt on, skipping dates already
 * too close to their start (isStartTooSoon, as for a request by hand). Null after the last date.
 */
export function nextSeriesStart(
  series: { nextStartsAt: Date; lastStartsAt: Date },
  now: Date,
): Date | null {
  for (let start = series.nextStartsAt; start <= series.lastStartsAt;) {
    if (!isStartTooSoon(start, now)) return start;
    start = addBerlinWeeks(start, 1);
  }
  return null;
}

/**
 * The teams of a fixed partnership whose current captain is not verified: its dates wait until
 * there are none (§5.28). The limit of open requests does not matter, the dates are booked at once.
 */
export function unverifiedCaptainTeams(
  teams: { id: string; captain: { verifiedAt: Date | null } }[],
): string[] {
  return teams.filter((team) => captainVerificationProblem(team.captain)).map((team) => team.id);
}

/** The teams of a series whose rows its writers lock: the team, and the partner of a partnership. */
function seriesTeamIds(series: { teamId: string; targetTeamId: string | null }): string[] {
  return series.targetTeamId ? [series.teamId, series.targetTeamId] : [series.teamId];
}

/**
 * Sweeper (§6.3 step 2): posts the due date of every running series whose team may post it now,
 * and books the due date of every fixed partnership whose captains are both verified. Each series
 * runs in its own transaction; a failing one is logged and does not hold up the others. Returns how
 * many requests were posted or booked.
 */
export async function postSeriesRequests(now: Date): Promise<number> {
  // Prefilter only: a date after nextStartsAt is never due earlier than nextStartsAt itself.
  const candidates = await prisma.requestSeries.findMany({
    where: { endedAt: null, nextStartsAt: { lte: addBerlinWeeks(now, 1) } },
    orderBy: { id: "asc" },
    select: { id: true, teamId: true, targetTeamId: true, createdById: true },
  });
  let posted = 0;
  for (const candidate of candidates) {
    try {
      if (await postSeriesRequest(candidate, now)) posted++;
    } catch (error) {
      console.error(`Posting the request of series ${candidate.id} failed`, error);
    }
  }
  return posted;
}

const seriesTeamSelect = {
  id: true,
  name: true,
  captainId: true,
  bannedAt: true,
  dissolvedAt: true,
  captain: { select: { id: true, verifiedAt: true } },
} satisfies Prisma.TeamSelect;

async function postSeriesRequest(
  candidate: { id: string; teamId: string; targetTeamId: string | null; createdById: string },
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Team (both teams of a partnership, §5.28), then the creator's user row (§4): deleteAccount
    // clears the notes of the creator's series under that row, also in teams the creator has left,
    // so the note read below is never one the deletion has already cleared everywhere else. Teams
    // and creator of a series never change.
    await lockTeams(tx, seriesTeamIds(candidate));
    await lockUser(tx, candidate.createdById);
    const series = await tx.requestSeries.findUniqueOrThrow({ where: { id: candidate.id } });
    if (series.endedAt) return false;
    const update = (data: { nextStartsAt?: Date; endedAt?: Date }) =>
      tx.requestSeries.update({ where: { id: series.id }, data });

    const team = await tx.team.findUniqueOrThrow({
      where: { id: series.teamId },
      select: seriesTeamSelect,
    });
    const partner = series.targetTeamId
      ? await tx.team.findUniqueOrThrow({
          where: { id: series.targetTeamId },
          select: seriesTeamSelect,
        })
      : null;
    // retireTeamActivity ends the series of a banned or dissolved team; this is the fallback.
    if (!isTeamActive(team) || (partner && !isTeamActive(partner))) {
      await update({ endedAt: now });
      return false;
    }
    const start = nextSeriesStart(series, now);
    if (!start) {
      await update({ endedAt: now });
      return false;
    }
    // Not due yet, or the team may not post now (limit, unverified captain; for a partnership an
    // unverified captain on either side): keep only the dates skipped as too late; the next run
    // tries again until this date is too late as well.
    const due = seriesPostsAt(start) <= now;
    const blocked =
      due &&
      (partner
        ? unverifiedCaptainTeams([team, partner]).length > 0
        : (await requestPostingProblems(team.captain, team, now, tx)).length > 0);
    if (!due || blocked) {
      if (start.getTime() !== series.nextStartsAt.getTime()) await update({ nextStartsAt: start });
      return false;
    }

    // The pointer moves in this transaction, so a request deleted later never comes back; the
    // unique (seriesId, startsAt) guards against a second request for the same date.
    const existing = await tx.scrimRequest.findUnique({
      where: { seriesId_startsAt: { seriesId: series.id, startsAt: start } },
      select: { id: true },
    });
    if (!existing) {
      const request = await tx.scrimRequest.create({
        data: {
          teamId: series.teamId,
          createdById: series.createdById,
          game: series.game,
          startsAt: start,
          format: series.format,
          rankMin: series.rankMin,
          rankMax: series.rankMax,
          maps: series.maps,
          note: series.note,
          seriesId: series.id,
          targetTeamId: series.targetTeamId,
          // A partnership is accepted already: its date is booked right away (§5.28).
          status: partner ? RequestStatus.BOOKED : RequestStatus.OPEN,
          createdAt: now,
        },
      });
      if (partner) await createScrimBooking(tx, { request, host: team, guest: partner, now });
    }
    const next = addBerlinWeeks(start, 1);
    await update(
      next > series.lastStartsAt ? { nextStartsAt: next, endedAt: now } : { nextStartsAt: next },
    );
    return !existing;
  });
}

/**
 * The captain ends a series: no more requests; the open ones stay (SPEC N-25). A fixed partnership
 * either captain ends; the other team is notified, booked dates stay (SPEC N-26).
 */
export async function endRequestSeries(input: {
  userId: string;
  seriesId: string;
  now: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The teams of a series never change, so the unlocked read names the right rows to lock.
    const series = await tx.requestSeries.findUnique({
      where: { id: input.seriesId },
      select: {
        teamId: true,
        targetTeamId: true,
        team: { select: { captainId: true } },
        targetTeam: { select: { captainId: true } },
      },
    });
    if (!series) throw new DomainError("NOT_FOUND", "seriesNotFound");
    // The partner's captain acts for the partner team; anyone else is checked against the team.
    const user = { id: input.userId };
    const actingTeamId =
      series.targetTeamId &&
      series.targetTeam &&
      !isCaptainOf(user, series.team) &&
      isCaptainOf(user, series.targetTeam)
        ? series.targetTeamId
        : series.teamId;
    // Before the lock, so nobody but a captain can hold the teams; checked again under it.
    await requireActingCaptain(input.userId, actingTeamId, tx);
    await lockTeams(tx, seriesTeamIds(series));
    const { team } = await requireActingCaptain(input.userId, actingTeamId, tx);
    const ended = await tx.requestSeries.updateManyAndReturn({
      where: { id: input.seriesId, endedAt: null },
      data: { endedAt: input.now },
      select: { nextStartsAt: true },
    });
    if (ended.length === 0) throw new DomainError("CONFLICT", "seriesEnded");
    if (!series.targetTeamId) return;
    await queueNotifications(tx, input.now, [
      {
        type: NotifType.PARTNERSHIP_ENDED,
        channel: NotifChannel.PERSONAL,
        entityId: input.seriesId,
        targetTeamId: actingTeamId === series.teamId ? series.targetTeamId : series.teamId,
        payload: { teamName: team.name, startsAt: ended[0]!.nextStartsAt.toISOString() },
      },
    ]);
  });
}
