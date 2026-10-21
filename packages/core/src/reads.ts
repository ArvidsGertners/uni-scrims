// Reads for the board, request and scrim pages (ARCHITECTURE §3 "Lesen", §5.7, §7).
import {
  AppStatus,
  type Prisma,
  type Rank,
  RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import type { Db } from "./db.ts";
import {
  actingCaptainProblem,
  canSeeApplications,
  isScrimTeam,
  requireUser,
  teamReadyProblem,
} from "./permissions.ts";
import { RANKS, isRankInRange, rankValue } from "./ranks.ts";
import { hasReadyMembers, isTeamReady } from "./readiness.ts";
import { applicantTeamProblem } from "./requests.ts";
import { feedbackClosedReason, isCancellable, isLateCancel } from "./scrims.ts";
import { teamUniversities } from "./teams.ts";
import { berlinDayRange, isValidDateString } from "./time.ts";

// ─── Reliability ──────────────────────────────────────────────────────────────

/** The average rating is only shown from this many ratings on (SPEC P0-8). */
export const MIN_RATINGS_SHOWN = 3;

export type Reliability = {
  played: number;
  noShows: number;
  lateCancels: number;
  /** null below MIN_RATINGS_SHOWN ratings. */
  avgRating: number | null;
};

/** Computed on read, never stored (§5.7). Batch variant for lists. */
export async function getReliabilities(
  teamIds: string[],
  db: Db = prisma,
): Promise<Map<string, Reliability>> {
  const ids = [...new Set(teamIds)];
  const result = new Map<string, Reliability>(
    ids.map((id) => [id, { played: 0, noShows: 0, lateCancels: 0, avgRating: null }]),
  );
  if (ids.length === 0) return result;

  const completed = await db.scrim.findMany({
    where: {
      status: ScrimStatus.COMPLETED,
      OR: [{ hostTeamId: { in: ids } }, { guestTeamId: { in: ids } }],
    },
    select: {
      hostTeamId: true,
      guestTeamId: true,
      feedback: { select: { teamId: true, rating: true } },
    },
  });
  const ratings = new Map<string, number[]>();
  for (const scrim of completed) {
    for (const teamId of [scrim.hostTeamId, scrim.guestTeamId]) {
      const entry = result.get(teamId);
      if (!entry) continue;
      entry.played++;
      // Ratings that the other team gave about this team.
      const rating = scrim.feedback.find((feedback) => feedback.teamId !== teamId)?.rating;
      if (rating != null) ratings.set(teamId, [...(ratings.get(teamId) ?? []), rating]);
    }
  }
  for (const [teamId, values] of ratings) {
    if (values.length >= MIN_RATINGS_SHOWN) {
      result.get(teamId)!.avgRating = values.reduce((sum, value) => sum + value, 0) / values.length;
    }
  }

  const noShows = await db.scrim.groupBy({
    by: ["noShowTeamId"],
    where: { status: ScrimStatus.NO_SHOW, noShowTeamId: { in: ids } },
    _count: { _all: true },
  });
  for (const row of noShows) result.get(row.noShowTeamId!)!.noShows = row._count._all;

  // Cancellations with more than 24 h lead and cancellations due to a ban have lateCancel = false.
  const lateCancels = await db.scrim.groupBy({
    by: ["cancelledByTeamId"],
    where: { status: ScrimStatus.CANCELLED, lateCancel: true, cancelledByTeamId: { in: ids } },
    _count: { _all: true },
  });
  for (const row of lateCancels) result.get(row.cancelledByTeamId!)!.lateCancels = row._count._all;

  return result;
}

export async function getReliability(teamId: string, db: Db = prisma): Promise<Reliability> {
  return (await getReliabilities([teamId], db)).get(teamId)!;
}

// ─── Team cards ───────────────────────────────────────────────────────────────

const teamCardSelect = {
  id: true,
  name: true,
  tag: true,
  rank: true,
  members: {
    select: {
      user: {
        select: { verifiedAt: true, universityOther: true, university: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.TeamSelect;

type TeamCardRow = Prisma.TeamGetPayload<{ select: typeof teamCardSelect }>;

export type TeamCardData = {
  id: string;
  name: string;
  tag: string;
  rank: Rank;
  universities: { shown: string[]; more: number };
  reliability: Reliability;
};

function toTeamCard(team: TeamCardRow, reliabilities: Map<string, Reliability>): TeamCardData {
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: team.rank,
    universities: teamUniversities(team.members),
    reliability: reliabilities.get(team.id)!,
  };
}

/** The user's team if it is not dissolved. */
async function findOwnTeam(userId: string) {
  const membership = await prisma.teamMember.findUnique({
    where: { userId },
    select: { team: true },
  });
  return membership && !membership.team.dissolvedAt ? membership.team : null;
}

// ─── Board ────────────────────────────────────────────────────────────────────

export type BoardInput = {
  userId: string;
  /** Berlin calendar date "YYYY-MM-DD"; invalid values are ignored. */
  date?: string | null;
  /** Requests whose range contains this rank. Default: own team rank; "ALL" = no rank filter. */
  rank?: Rank | "ALL" | null;
  now: Date;
};

/** Open, future requests of active teams (SPEC P0-4). Own requests come separately, unfiltered. */
export async function getBoard(input: BoardInput) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  const rank = input.rank === "ALL" ? null : (input.rank ?? ownTeam?.rank ?? null);
  const date = input.date && isValidDateString(input.date) ? input.date : null;
  const range = date ? berlinDayRange(date) : null;

  const base: Prisma.ScrimRequestWhereInput = {
    status: RequestStatus.OPEN,
    startsAt: { gt: input.now },
    team: { bannedAt: null, dissolvedAt: null },
  };
  const filtered: Prisma.ScrimRequestWhereInput = {
    ...base,
    startsAt: { gt: input.now, ...(range ? { gte: range.from, lt: range.to } : {}) },
    ...(ownTeam ? { teamId: { not: ownTeam.id } } : {}),
    // Enums have no order in Prisma filters: rankMin ≤ rank ≤ rankMax via the rank list.
    ...(rank
      ? {
          rankMin: { in: RANKS.slice(0, rankValue(rank)) },
          rankMax: { in: RANKS.slice(rankValue(rank) - 1) },
        }
      : {}),
  };
  const include = {
    team: { select: teamCardSelect },
    _count: { select: { applications: { where: { status: AppStatus.PENDING } } } },
  } satisfies Prisma.ScrimRequestInclude;

  const [requests, ownRequests] = await Promise.all([
    prisma.scrimRequest.findMany({ where: filtered, include, orderBy: { startsAt: "asc" } }),
    ownTeam
      ? prisma.scrimRequest.findMany({
          where: { ...base, teamId: ownTeam.id },
          include,
          orderBy: { startsAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const reliabilities = await getReliabilities(
    [...requests, ...ownRequests].map((request) => request.teamId),
  );
  const ownApplications = ownTeam
    ? await prisma.application.findMany({
        where: { teamId: ownTeam.id, requestId: { in: requests.map((request) => request.id) } },
        select: { requestId: true, status: true },
      })
    : [];

  const toCard = (request: (typeof requests)[number]) => ({
    id: request.id,
    startsAt: request.startsAt,
    format: request.format,
    rankMin: request.rankMin,
    rankMax: request.rankMax,
    maps: request.maps,
    applicationCount: request._count.applications,
    team: toTeamCard(request.team, reliabilities),
    ownApplicationStatus:
      ownApplications.find((application) => application.requestId === request.id)?.status ?? null,
  });

  return {
    ownTeam: ownTeam
      ? { id: ownTeam.id, rank: ownTeam.rank, isCaptain: ownTeam.captainId === user.id }
      : null,
    filter: { date, rank },
    requests: requests.map(toCard),
    ownRequests: ownRequests.map(toCard),
  };
}

// ─── Request detail ───────────────────────────────────────────────────────────

/**
 * An action a page may offer (§7): null if it does not apply (nothing to show), otherwise
 * problem is null when core allows it, or the reason to show instead.
 */
export type ActionOffer = { problem: string | null } | null;

/**
 * Request for logged-in users; applications only for members of the creating team (§7).
 * null for unknown requests and those of banned or dissolved teams.
 */
export async function getRequestDetail(input: { userId: string; requestId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const request = await prisma.scrimRequest.findUnique({
    where: { id: input.requestId },
    include: {
      team: { select: { ...teamCardSelect, bannedAt: true, dissolvedAt: true } },
      scrim: { select: { id: true, hostTeamId: true, guestTeamId: true } },
    },
  });
  if (!request || request.team.bannedAt || request.team.dissolvedAt) return null;

  const ownTeam = await findOwnTeam(user.id);
  const isOwner = ownTeam?.id === request.teamId;
  const showApplications = canSeeApplications(ownTeam?.id, request);
  const applications = showApplications
    ? await prisma.application.findMany({
        where: { requestId: request.id },
        orderBy: { createdAt: "asc" },
        include: { team: { select: { ...teamCardSelect, bannedAt: true, dissolvedAt: true } } },
      })
    : [];
  const ownApplication =
    ownTeam && !isOwner
      ? await prisma.application.findUnique({
          where: { requestId_teamId: { requestId: request.id, teamId: ownTeam.id } },
          select: { id: true, status: true, message: true },
        })
      : null;
  const reliabilities = await getReliabilities([
    request.teamId,
    ...applications.map((application) => application.teamId),
  ]);
  const scrim = request.scrim;
  const open = request.status === RequestStatus.OPEN && request.startsAt > input.now;
  const actionProblem = ownTeam ? actingCaptainProblem(user, ownTeam) : null;

  // Applying and confirming need a ready team, withdrawing and deleting do not (SPEC P0-3).
  const apply: ActionOffer =
    open && ownTeam && !isOwner && !ownApplication
      ? { problem: actionProblem ?? teamReadyProblem(await isTeamReady(ownTeam.id)) }
      : null;
  const withdraw: ActionOffer =
    ownApplication?.status === AppStatus.PENDING ? { problem: actionProblem } : null;
  const remove: ActionOffer = isOwner && open ? { problem: actionProblem } : null;
  const pending = applications.filter((application) => application.status === AppStatus.PENDING);
  // For the owner, request.team is the own team with its members already loaded.
  const confirm: ActionOffer =
    isOwner && open && pending.length > 0
      ? { problem: actionProblem ?? teamReadyProblem(hasReadyMembers(request.team.members)) }
      : null;
  // The applicant team must still be active and ready, as confirmApplication checks it.
  const confirmOffer = (application: (typeof applications)[number]) => {
    const pendingHere = confirm !== null && application.status === AppStatus.PENDING;
    const teamProblem = pendingHere
      ? applicantTeamProblem(application.team, hasReadyMembers(application.team.members))
      : null;
    return { canConfirm: pendingHere && confirm.problem === null && !teamProblem, teamProblem };
  };

  return {
    id: request.id,
    status: request.status,
    open,
    startsAt: request.startsAt,
    format: request.format,
    rankMin: request.rankMin,
    rankMax: request.rankMax,
    maps: request.maps,
    note: request.note,
    team: toTeamCard(request.team, reliabilities),
    hasTeam: ownTeam !== null,
    isOwner,
    apply,
    withdraw,
    remove,
    /** Shown once for all pending applications; problems of the applicant team are per application. */
    confirm,
    /** Own team rank outside the requested range: allowed, with a hint (SPEC P0-5). */
    outOfRange: ownTeam ? !isRankInRange(ownTeam.rank, request.rankMin, request.rankMax) : false,
    ownApplication,
    applications: showApplications
      ? applications.map((application) => ({
          id: application.id,
          status: application.status,
          message: application.message,
          createdAt: application.createdAt,
          outOfRange: !isRankInRange(application.team.rank, request.rankMin, request.rankMax),
          team: toTeamCard(application.team, reliabilities),
          ...confirmOffer(application),
        }))
      : null,
    scrimId: scrim && isScrimTeam(ownTeam?.id, scrim) ? scrim.id : null,
  };
}

// ─── Scrims ───────────────────────────────────────────────────────────────────

const scrimTeamSelect = {
  id: true,
  name: true,
  tag: true,
  captain: { select: { id: true, name: true } },
} satisfies Prisma.TeamSelect;

/** Only for current members of both teams (§7); null otherwise. */
export async function getScrimDetail(input: { userId: string; scrimId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  const scrim = await prisma.scrim.findUnique({
    where: { id: input.scrimId },
    include: {
      hostTeam: { select: scrimTeamSelect },
      guestTeam: { select: scrimTeamSelect },
      request: { select: { note: true } },
      feedback: { select: { teamId: true, outcome: true, rating: true } },
    },
  });
  if (!scrim || !ownTeam || !isScrimTeam(ownTeam.id, scrim)) return null;

  const isHost = scrim.hostTeamId === ownTeam.id;
  const opponent = isHost ? scrim.guestTeam : scrim.hostTeam;
  const actionProblem = actingCaptainProblem(user, ownTeam);
  const ownFeedback = scrim.feedback.find((feedback) => feedback.teamId === ownTeam.id) ?? null;
  const feedbackClosed = feedbackClosedReason(scrim, input.now);

  return {
    id: scrim.id,
    status: scrim.status,
    startsAt: scrim.startsAt,
    format: scrim.format,
    maps: scrim.maps,
    note: scrim.request.note,
    feedbackDeadline: scrim.feedbackDeadline,
    isHost,
    ownTeam: { id: ownTeam.id, name: ownTeam.name, tag: ownTeam.tag },
    /** The opponent's current captain is visible after booking (SPEC P0-6). */
    opponent: {
      id: opponent.id,
      name: opponent.name,
      tag: opponent.tag,
      captainName: opponent.captain.name,
    },
    /** null if the user may cancel and give feedback for the own team, otherwise why not. */
    actionProblem,
    cancelledByUs: scrim.cancelledByTeamId === ownTeam.id,
    lateCancel: scrim.lateCancel,
    noShow:
      scrim.noShowTeamId === null
        ? null
        : scrim.noShowTeamId === ownTeam.id
          ? ("US" as const)
          : ("OPPONENT" as const),
    ownFeedback: ownFeedback ? { outcome: ownFeedback.outcome, rating: ownFeedback.rating } : null,
    cancellable: isCancellable(scrim, input.now),
    canCancel: actionProblem === null && isCancellable(scrim, input.now),
    /** A cancellation now would count as late. */
    cancelWouldBeLate: isLateCancel(scrim.startsAt, input.now),
    /** null while feedback is possible (start until deadline), otherwise why not. */
    feedbackClosed,
    canGiveFeedback: actionProblem === null && !ownFeedback && feedbackClosed === null,
  };
}

/** "Meine Scrims": upcoming (scheduled, in the future) and everything else, newest first. */
export async function getMyScrims(input: { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  if (!ownTeam) return { hasTeam: false, upcoming: [], past: [] };
  const scrims = await prisma.scrim.findMany({
    where: { OR: [{ hostTeamId: ownTeam.id }, { guestTeamId: ownTeam.id }] },
    orderBy: { startsAt: "asc" },
    include: {
      hostTeam: { select: { name: true, tag: true } },
      guestTeam: { select: { name: true, tag: true } },
    },
  });
  const items = scrims.map((scrim) => ({
    id: scrim.id,
    startsAt: scrim.startsAt,
    format: scrim.format,
    status: scrim.status,
    opponent: scrim.hostTeamId === ownTeam.id ? scrim.guestTeam : scrim.hostTeam,
  }));
  const isUpcoming = (item: (typeof items)[number]) =>
    item.status === ScrimStatus.SCHEDULED && item.startsAt > input.now;
  return {
    hasTeam: true,
    upcoming: items.filter(isUpcoming),
    past: items.filter((item) => !isUpcoming(item)).reverse(),
  };
}
