// Direct requests to one team (SPEC N-26, ARCHITECTURE §5.28). createRequest posts them with a
// target; they are not on the board and take no applications. The target team's captain accepts
// (books the scrim like confirmApplication) or declines. A proposed fixed partnership becomes a
// RequestSeries only when the first date is accepted, so every series with a target is accepted.
import { NotifChannel, NotifType, RequestStatus, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { DomainError } from "./errors.ts";
import { msg } from "./i18n/render.ts";
import { lockRequest, lockTeam, lockTeams } from "./locks.ts";
import { queueNotifications } from "./notifications.ts";
import { requireActingCaptain } from "./permissions.ts";
import { isTeamActive } from "./readiness.ts";
import { createScrimBooking, isRequestOpen, openRequestWhere } from "./requests.ts";
import { addBerlinWeeks } from "./time.ts";

function requestNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "requestNotFound");
}

function notOpen(): DomainError {
  return new DomainError("CONFLICT", "requestNotOpen");
}

/** Requesting and target team of a direct request; both never change, so unlocked reads suffice. */
async function findDirectRequestTeams(requestId: string, db: Db) {
  const request = await db.scrimRequest.findUnique({
    where: { id: requestId },
    select: { teamId: true, targetTeamId: true },
  });
  if (!request?.targetTeamId) throw requestNotFound();
  return { teamId: request.teamId, targetTeamId: request.targetTeamId };
}

/**
 * The target team's captain accepts: the scrim is booked with the requesting team as host (§5.4,
 * §5.28). A proposed partnership is created in the same transaction and books its further dates in
 * the sweeper. Returns the scrim.
 */
export async function acceptDirectRequest(input: { userId: string; requestId: string; now: Date }) {
  const { now } = input;
  return prisma.$transaction(async (tx) => {
    const teams = await findDirectRequestTeams(input.requestId, tx);
    // Before any lock, so nobody but the target's captain can hold the teams; checked again below.
    await requireActingCaptain(input.userId, teams.targetTeamId, tx);
    // Both teams before the request (§4), as in confirmApplication: a ban or dissolution of either
    // team either commits first (seen below) or waits until the scrim is booked and cancels it.
    await lockTeams(tx, [teams.teamId, teams.targetTeamId]);
    await lockRequest(tx, input.requestId);
    const request = await tx.scrimRequest.findUniqueOrThrow({
      where: { id: input.requestId },
      include: { team: true },
    });
    const { team: guest } = await requireActingCaptain(input.userId, teams.targetTeamId, tx);
    const host = request.team;
    if (!isRequestOpen(request, now)) throw notOpen();
    if (!isTeamActive(host)) {
      throw new DomainError("CONFLICT", msg("requestingTeamInactive", { team: host.name }));
    }
    const booked = await tx.scrimRequest.updateMany({
      where: { id: request.id, ...openRequestWhere(now) },
      data: { status: RequestStatus.BOOKED },
    });
    if (booked.count === 0) throw notOpen();
    if (request.weeklyLastStartsAt) {
      const series = await tx.requestSeries.create({
        data: {
          teamId: host.id,
          targetTeamId: guest.id,
          createdById: request.createdById,
          game: request.game,
          format: request.format,
          rankMin: request.rankMin,
          rankMax: request.rankMax,
          maps: request.maps,
          note: request.note,
          nextStartsAt: addBerlinWeeks(request.startsAt, 1),
          lastStartsAt: request.weeklyLastStartsAt,
          createdAt: now,
        },
      });
      await tx.scrimRequest.update({ where: { id: request.id }, data: { seriesId: series.id } });
    }
    return createScrimBooking(tx, { request, host, guest, now });
  });
}

/** The target team's captain declines; the requesting team is notified (§5.28). */
export async function declineDirectRequest(input: {
  userId: string;
  requestId: string;
  now: Date;
}): Promise<void> {
  const { now } = input;
  await prisma.$transaction(async (tx) => {
    const teams = await findDirectRequestTeams(input.requestId, tx);
    await requireActingCaptain(input.userId, teams.targetTeamId, tx);
    // The target team before the request (§4), and the role checked again under it.
    await lockTeam(tx, teams.targetTeamId);
    await lockRequest(tx, input.requestId);
    const { team } = await requireActingCaptain(input.userId, teams.targetTeamId, tx);
    const request = await tx.scrimRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (!isRequestOpen(request, now)) throw notOpen();
    const declined = await tx.scrimRequest.updateMany({
      where: { id: request.id, ...openRequestWhere(now) },
      data: { status: RequestStatus.DECLINED },
    });
    if (declined.count === 0) throw notOpen();
    await queueNotifications(tx, now, [
      {
        type: NotifType.DIRECT_REQUEST_DECLINED,
        channel: NotifChannel.PERSONAL,
        entityId: request.id,
        targetTeamId: request.teamId,
        requestId: request.id,
        payload: { teamName: team.name, startsAt: request.startsAt.toISOString() },
      },
    ]);
  });
}
