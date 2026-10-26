// Weekly recurring requests (SPEC N-25, ARCHITECTURE §5.27). A series keeps only its next date; the
// sweeper posts each date a week before its start, when the previous date starts, as soon as the
// team may post it, and drops the date once it is too close to its start.
import { RequestStatus, prisma } from "@uni-scrims/db";
import { DomainError } from "./errors.ts";
import { lockTeam, lockUser } from "./locks.ts";
import { requireActingCaptain } from "./permissions.ts";
import { isTeamActive } from "./readiness.ts";
import { isStartTooSoon, requestPostingProblems } from "./requests.ts";
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
 * Sweeper (§6.3 step 2): posts the due date of every running series whose team may post it now.
 * Each series runs in its own transaction; a failing one is logged and does not hold up the others.
 * Returns how many requests were posted.
 */
export async function postSeriesRequests(now: Date): Promise<number> {
  // Prefilter only: a date after nextStartsAt is never due earlier than nextStartsAt itself.
  const candidates = await prisma.requestSeries.findMany({
    where: { endedAt: null, nextStartsAt: { lte: addBerlinWeeks(now, 1) } },
    orderBy: { id: "asc" },
    select: { id: true, teamId: true, createdById: true },
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

async function postSeriesRequest(
  candidate: { id: string; teamId: string; createdById: string },
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Team, then the creator's user row (§4): deleteAccount clears the notes of the creator's series
    // under that row, also in teams the creator has left, so the note read below is never one the
    // deletion has already cleared everywhere else. Team and creator of a series never change.
    await lockTeam(tx, candidate.teamId);
    await lockUser(tx, candidate.createdById);
    const series = await tx.requestSeries.findUniqueOrThrow({ where: { id: candidate.id } });
    if (series.endedAt) return false;
    const update = (data: { nextStartsAt?: Date; endedAt?: Date }) =>
      tx.requestSeries.update({ where: { id: series.id }, data });

    const team = await tx.team.findUniqueOrThrow({
      where: { id: series.teamId },
      select: {
        id: true,
        captainId: true,
        bannedAt: true,
        dissolvedAt: true,
        captain: { select: { id: true, verifiedAt: true } },
      },
    });
    // retireTeamActivity ends the series of a banned or dissolved team; this is the fallback.
    if (!isTeamActive(team)) {
      await update({ endedAt: now });
      return false;
    }
    const start = nextSeriesStart(series, now);
    if (!start) {
      await update({ endedAt: now });
      return false;
    }
    // Not due yet, or the team may not post now (limit, unverified captain): keep only the dates
    // skipped as too late; the next run tries again until this date is too late as well.
    const due = seriesPostsAt(start) <= now;
    const [problem] = due ? await requestPostingProblems(team.captain, team, now, tx) : [];
    if (!due || problem) {
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
      await tx.scrimRequest.create({
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
          status: RequestStatus.OPEN,
          createdAt: now,
        },
      });
    }
    const next = addBerlinWeeks(start, 1);
    await update(
      next > series.lastStartsAt ? { nextStartsAt: next, endedAt: now } : { nextStartsAt: next },
    );
    return !existing;
  });
}

/** The captain ends a series: no more requests; the open ones stay (SPEC N-25). */
export async function endRequestSeries(input: {
  userId: string;
  seriesId: string;
  now: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The team of a series never changes, so the unlocked read names the right row to lock.
    const series = await tx.requestSeries.findUnique({
      where: { id: input.seriesId },
      select: { teamId: true },
    });
    if (!series) throw new DomainError("NOT_FOUND", "seriesNotFound");
    // Before the lock, so nobody but the captain can hold the team; checked again under it.
    await requireActingCaptain(input.userId, series.teamId, tx);
    await lockTeam(tx, series.teamId);
    await requireActingCaptain(input.userId, series.teamId, tx);
    const ended = await tx.requestSeries.updateMany({
      where: { id: input.seriesId, endedAt: null },
      data: { endedAt: input.now },
    });
    if (ended.count === 0) throw new DomainError("CONFLICT", "seriesEnded");
  });
}
