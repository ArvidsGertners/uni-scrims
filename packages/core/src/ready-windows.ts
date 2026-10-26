// "Heute spielbereit" (SPEC N-27, ARCHITECTURE §5.29): a team announces the start times it can play
// at this evening; other teams send a direct request (SPEC N-26) for one of them with one click.
// Accepting one books the scrim, ends the window and declines the other requests in it. Only
// holders of the team's lock change a window (§4); there is no sweeper step, reads apply the
// running rule (isReadyWindowRunning) with `now`.
import { NotifChannel, NotifType, type Prisma, RequestStatus, prisma } from "@uni-scrims/db";
import { TIMING } from "../config/timing.ts";
import type { ValorantMap } from "../config/maps.ts";
import { isUniqueViolation } from "./db.ts";
import { DomainError, problemError } from "./errors.ts";
import { msg } from "./i18n/render.ts";
import { lockRequest, lockTeam } from "./locks.ts";
import { type ReadyWindowDeclineReason, queueNotifications } from "./notifications.ts";
import { actingCaptainProblem, requireActingCaptain, requireTeamMember } from "./permissions.ts";
import {
  alreadyRequestedWindow,
  createRequest,
  isReadyWindowRunning,
  isStartTooSoon,
  openRequestWhere,
  runningReadyWindowWhere,
} from "./requests.ts";
import { type ReadyWindowInput, parseInput, readyWindowInputSchema } from "./schemas.ts";
import { scrimEveningStarts, toBerlinDateString, toBerlinTimeString } from "./time.ts";

const SLOT_MS = 15 * 60_000;

function readyWindowNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "readyWindowNotFound");
}

/** The start times of the current evening a new window can offer: those not too soon (§5.29). */
export function readyWindowStarts(now: Date): Date[] {
  return scrimEveningStarts(now).filter((start) => !isStartTooSoon(start, now));
}

/**
 * The start times of a window that can still be requested, in order. A window lies within one
 * evening, which ends before the DST change, so 15-minute steps stay on the grid.
 */
export function readyWindowStartOptions(
  window: { firstStartsAt: Date; lastStartsAt: Date },
  now: Date,
): Date[] {
  const options: Date[] = [];
  for (
    let at = window.firstStartsAt.getTime();
    at <= window.lastStartsAt.getTime();
    at += SLOT_MS
  ) {
    const start = new Date(at);
    if (!isStartTooSoon(start, now)) options.push(start);
  }
  return options;
}

/**
 * Announces the team the form was shown for (§5.20) as ready to play today. The captain must be
 * allowed to post (verified, not banned), but the window does not count to the request limit.
 */
export async function createReadyWindow(
  input: ReadyWindowInput & { userId: string; teamId: string; now: Date },
) {
  const { now } = input;
  return prisma.$transaction(async (tx) => {
    const { user, team } = await requireActingCaptain(input.userId, input.teamId, tx);
    const data = parseInput(readyWindowInputSchema, input);
    const starts = readyWindowStarts(now);
    const startAt = (time: string) => starts.find((start) => toBerlinTimeString(start) === time);
    const [first, last] = [startAt(data.from), startAt(data.to)];
    if (!first || !last) {
      const minutes = Math.round(TIMING.MIN_REQUEST_LEAD / 60_000);
      throw new DomainError("INVALID", msg("readyWindowTimeInvalid", { minutes }));
    }
    if (first > last) throw new DomainError("INVALID", "readyWindowOrder");
    // Team lock: one running window per team, and a ban or dissolution either commits first (seen
    // below) or waits and then ends this window. Role, ban and verification are read again under it.
    await lockTeam(tx, team.id);
    const current = await requireTeamMember(user.id, team.id, tx);
    const problem = actingCaptainProblem(current.user, current.team);
    if (problem) throw problemError(problem);
    const running = await tx.readyWindow.findFirst({
      where: { teamId: team.id, ...runningReadyWindowWhere(now) },
      select: { id: true },
    });
    if (running) throw new DomainError("CONFLICT", "readyWindowExists");
    return tx.readyWindow.create({
      data: {
        teamId: team.id,
        createdById: user.id,
        game: team.game,
        firstStartsAt: first,
        lastStartsAt: last,
        format: data.format,
        rankMin: data.rankMin,
        rankMax: data.rankMax,
        maps: data.maps,
        createdAt: now,
      },
    });
  });
}

/**
 * Locks the open requests of a window, with `alsoId` (the request being accepted), in id order after
 * the team locks (§4). No request joins the window meanwhile: creating one needs the team's lock.
 */
export async function lockReadyWindowRequests(
  tx: Prisma.TransactionClient,
  windowId: string,
  now: Date,
  alsoId?: string,
): Promise<void> {
  const open = await tx.scrimRequest.findMany({
    where: { readyWindowId: windowId, ...openRequestWhere(now) },
    select: { id: true },
  });
  const ids = [...new Set([...open.map(({ id }) => id), ...(alsoId ? [alsoId] : [])])].sort();
  for (const id of ids) await lockRequest(tx, id);
}

/**
 * Ends the window and declines its open requests; their teams are told why (§5.29). The caller holds
 * the team lock and the requests (lockReadyWindowRequests). Requests withdrawn meanwhile stay as they
 * are.
 */
export async function closeReadyWindow(
  tx: Prisma.TransactionClient,
  input: { windowId: string; teamName: string; reason: ReadyWindowDeclineReason; now: Date },
): Promise<void> {
  const { now } = input;
  await tx.readyWindow.updateMany({
    where: { id: input.windowId, endedAt: null },
    data: { endedAt: now },
  });
  const declined = await tx.scrimRequest.updateManyAndReturn({
    where: { readyWindowId: input.windowId, ...openRequestWhere(now) },
    data: { status: RequestStatus.DECLINED },
    select: { id: true, teamId: true, startsAt: true },
  });
  await queueNotifications(
    tx,
    now,
    declined.map((request) => ({
      type: NotifType.DIRECT_REQUEST_DECLINED,
      channel: NotifChannel.PERSONAL,
      entityId: request.id,
      targetTeamId: request.teamId,
      requestId: request.id,
      payload: {
        teamName: input.teamName,
        startsAt: request.startsAt.toISOString(),
        readyWindow: input.reason,
      },
    })),
  );
}

/** The captain ends the window by hand; its open requests are declined with a notice (§5.29). */
export async function endReadyWindow(input: {
  userId: string;
  windowId: string;
  now: Date;
}): Promise<void> {
  const { now } = input;
  await prisma.$transaction(async (tx) => {
    // The team of a window never changes, so the unlocked read names the right row.
    const unlocked = await tx.readyWindow.findUnique({
      where: { id: input.windowId },
      select: { teamId: true },
    });
    if (!unlocked) throw readyWindowNotFound();
    // Before any lock, so nobody but the captain can hold the team; checked again under it.
    await requireActingCaptain(input.userId, unlocked.teamId, tx);
    await lockTeam(tx, unlocked.teamId);
    const { team } = await requireActingCaptain(input.userId, unlocked.teamId, tx);
    await lockReadyWindowRequests(tx, input.windowId, now);
    const window = await tx.readyWindow.findUniqueOrThrow({ where: { id: input.windowId } });
    if (!isReadyWindowRunning(window, now)) {
      throw new DomainError("CONFLICT", "readyWindowClosed");
    }
    await closeReadyWindow(tx, { windowId: window.id, teamName: team.name, reason: "ENDED", now });
  });
}

/**
 * A direct request for `startsAt` in another team's window, as `teamId` (the team the board was
 * shown for, §5.20): format and maps of the window, no note, no rank range (SPEC N-27). The rules
 * of createRequest apply (§5.28); it checks the window under both team locks.
 */
export async function requestReadyWindow(input: {
  userId: string;
  teamId: string;
  windowId: string;
  startsAt: Date;
  now: Date;
}) {
  // Team, format and maps of a window never change, so they are read without a lock.
  const window = await prisma.readyWindow.findUnique({
    where: { id: input.windowId },
    select: { id: true, teamId: true, format: true, maps: true },
  });
  if (!window) throw readyWindowNotFound();
  if (Number.isNaN(input.startsAt.getTime())) {
    throw new DomainError("INVALID", "startOutsideWindow");
  }
  try {
    return await createRequest({
      userId: input.userId,
      teamId: input.teamId,
      targetTeamId: window.teamId,
      readyWindowId: window.id,
      // The Berlin date and time of the start: createRequest checks grid and lead time as always.
      date: toBerlinDateString(input.startsAt),
      time: toBerlinTimeString(input.startsAt),
      format: window.format,
      // Validated when the window was created.
      maps: window.maps as ValorantMap[],
      note: null,
      now: input.now,
    });
  } catch (error) {
    // Two requests of one team wait for each other on its lock; this only catches what slips past.
    if (isUniqueViolation(error)) throw alreadyRequestedWindow();
    throw error;
  }
}
