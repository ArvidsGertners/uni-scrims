// Reads for the board, request and scrim pages (ARCHITECTURE §3 "Lesen", §5.7, §7).
import { AppStatus, type Prisma, type Rank, ScrimStatus, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import {
  actingCaptainProblem,
  canSeeApplications,
  findOwnTeam,
  isCaptainOf,
  isScrimTeam,
  requireUser,
  teamReadyProblem,
} from "./permissions.ts";
import { RANKS, isRankInRange, rankValue } from "./ranks.ts";
import { activeTeamWhere, hasReadyMembers, isTeamActive, isTeamReady } from "./readiness.ts";
import {
  applicantTeamProblem,
  isRequestOpen,
  openRequestWhere,
  requestPostingProblems,
} from "./requests.ts";
import { feedbackClosedReason, isCancellable, isLateCancel } from "./scrims.ts";
import { type TeamLogoInfo, loadTeamLogoInfo, teamLogoInfo, teamLogoSelect } from "./team-logo.ts";
import { teamUniversities } from "./teams.ts";
import { berlinDayRange, isValidDateString } from "./time.ts";
import { getDiscordId } from "./users.ts";

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
  ...teamLogoSelect,
  members: {
    select: {
      role: true,
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
  /** The team's logos for their URLs; null without logo (§5.11). */
  logo: TeamLogoInfo | null;
  universities: { shown: string[]; more: number };
  reliability: Reliability;
};

function toTeamCard(team: TeamCardRow, reliabilities: Map<string, Reliability>): TeamCardData {
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: team.rank,
    logo: teamLogoInfo(team),
    universities: teamUniversities(team.members),
    reliability: reliabilities.get(team.id)!,
  };
}

// ─── Board ────────────────────────────────────────────────────────────────────

export type BoardInput = {
  userId: string;
  /** Berlin calendar date "YYYY-MM-DD"; invalid values are ignored. */
  date?: string | null;
  /**
   * Requests whose range contains one of these ranks. Default (missing or empty): own team rank;
   * "ALL" = no rank filter.
   */
  ranks?: readonly Rank[] | "ALL" | null;
  now: Date;
};

/** Open, future requests of active teams (SPEC P0-4). Own requests come separately, unfiltered. */
export async function getBoard(input: BoardInput) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  const chosen = input.ranks;
  // In rank order, without duplicates; empty = all ranks.
  const ranks =
    chosen === "ALL"
      ? []
      : chosen?.length
        ? RANKS.filter((rank) => chosen.includes(rank))
        : ownTeam
          ? [ownTeam.rank]
          : [];
  const date = input.date && isValidDateString(input.date) ? input.date : null;
  const range = date ? berlinDayRange(date) : null;

  const base: Prisma.ScrimRequestWhereInput = {
    ...openRequestWhere(input.now),
    team: activeTeamWhere(),
  };
  // Each filter is its own AND entry, so none can overwrite a condition of base.
  const filtered: Prisma.ScrimRequestWhereInput = {
    AND: [
      base,
      ...(range ? [{ startsAt: { gte: range.from, lt: range.to } }] : []),
      ...(ownTeam ? [{ teamId: { not: ownTeam.id } }] : []),
      // Enums have no order in Prisma filters: rankMin ≤ rank ≤ rankMax via the rank list.
      ...(ranks.length > 0
        ? [
            {
              OR: ranks.map((rank) => ({
                rankMin: { in: RANKS.slice(0, rankValue(rank)) },
                rankMax: { in: RANKS.slice(rankValue(rank) - 1) },
              })),
            },
          ]
        : []),
    ],
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
      ? { id: ownTeam.id, rank: ownTeam.rank, isCaptain: isCaptainOf(user, ownTeam) }
      : null,
    filter: { date, ranks },
    requests: requests.map(toCard),
    ownRequests: ownRequests.map(toCard),
  };
}

// ─── Request form ─────────────────────────────────────────────────────────────

/**
 * Form "Anfrage erstellen": null without a team. problems are requestPostingProblems, the list
 * createRequest throws the first entry of under the team lock, so nobody fills in the form in vain:
 * the captain sees every reason at once, other members only that the captain has to act, and a
 * ban is the only reason. kind lets the page link to where each one is fixed (§7).
 */
export async function getRequestForm(input: { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  if (!ownTeam) return null;
  const problems = await requestPostingProblems(user, ownTeam, input.now, prisma);
  return {
    rank: ownTeam.rank,
    problems: problems.map(({ kind, message }) => ({ kind, message })),
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
  if (!request || !isTeamActive(request.team)) return null;

  const ownTeam = await findOwnTeam(user.id);
  const isOwner = ownTeam?.id === request.teamId;
  const showApplications = canSeeApplications(ownTeam?.id, request);
  // Only one of the two ever runs: the creating team sees all applications, others their own.
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
  const scrim = request.scrim;
  const open = isRequestOpen(request, input.now);
  const offersApply = open && ownTeam !== null && !isOwner && !ownApplication;
  const pending = applications.filter((application) => application.status === AppStatus.PENDING);
  const offersConfirm = isOwner && open && pending.length > 0;
  const actionProblem = ownTeam ? (actingCaptainProblem(user, ownTeam)?.message ?? null) : null;
  // Applying and confirming need a ready team, withdrawing and deleting do not (SPEC P0-3).
  // Readiness is only counted when it decides: one of the two is offered and nothing else blocks
  // it. Then it runs alongside the reliabilities; null means not counted.
  const countReadiness =
    ownTeam !== null && actionProblem === null && (offersApply || offersConfirm);
  const [reliabilities, ownTeamReady, ownMemberCount] = await Promise.all([
    getReliabilities([request.teamId, ...applications.map((application) => application.teamId)]),
    countReadiness ? isTeamReady(ownTeam.id) : null,
    offersApply ? prisma.teamMember.count({ where: { teamId: ownTeam.id } }) : null,
  ]);
  const readyProblem = ownTeamReady === null ? null : teamReadyProblem(ownTeamReady);
  const bookingProblem = actionProblem ?? readyProblem?.message ?? null;

  const apply: ActionOffer = offersApply ? { problem: bookingProblem } : null;
  const withdraw: ActionOffer =
    ownApplication?.status === AppStatus.PENDING ? { problem: actionProblem } : null;
  // Only the captain can ever delete, so other members do not see it (§7).
  const remove: ActionOffer =
    isOwner && open && isCaptainOf(user, ownTeam) ? { problem: actionProblem } : null;
  const confirm: ActionOffer = offersConfirm ? { problem: bookingProblem } : null;
  // The applicant team must still be active and ready, as confirmApplication checks it
  // (findApplicantTeamProblem); here from the members that are already loaded.
  const confirmOffer = (application: (typeof applications)[number]) => {
    if (!confirm || application.status !== AppStatus.PENDING) {
      return { canConfirm: false, teamProblem: null };
    }
    const { team } = application;
    const teamProblem = applicantTeamProblem(team, hasReadyMembers(team.members));
    return { canConfirm: confirm.problem === null && teamProblem === null, teamProblem };
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
    apply,
    /** The team that would apply, for "Du bewirbst dich als …"; only while applying is offered. */
    applyAs:
      offersApply && ownMemberCount !== null
        ? { name: ownTeam.name, memberCount: ownMemberCount }
        : null,
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
  const actionProblem = actingCaptainProblem(user, ownTeam)?.message ?? null;
  const ownFeedback = scrim.feedback.find((feedback) => feedback.teamId === ownTeam.id) ?? null;
  const feedbackClosed = feedbackClosedReason(scrim, input.now);
  const opponentCaptainDiscordId = await getDiscordId(opponent.captain.id);

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
      /** For the "write on Discord" link. */
      captainDiscordId: opponentCaptainDiscordId,
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

/**
 * "Meine Scrims": upcoming scrims (scheduled, in the future), everything else newest first, the own
 * team's open requests and its applications to requests that have not started yet.
 */
export async function getMyScrims(input: { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  if (!ownTeam) {
    return { hasTeam: false, team: null, upcoming: [], past: [], requests: [], applications: [] };
  }
  const opponentSelect = {
    ...teamCardSelect,
    captain: { select: { id: true, name: true } },
  } satisfies Prisma.TeamSelect;
  const [scrims, requests, applications] = await Promise.all([
    prisma.scrim.findMany({
      where: { OR: [{ hostTeamId: ownTeam.id }, { guestTeamId: ownTeam.id }] },
      orderBy: { startsAt: "asc" },
      include: {
        hostTeam: { select: opponentSelect },
        guestTeam: { select: opponentSelect },
        request: { select: { rankMin: true, rankMax: true } },
        feedback: { select: { teamId: true } },
      },
    }),
    prisma.scrimRequest.findMany({
      where: { ...openRequestWhere(input.now), teamId: ownTeam.id },
      orderBy: { startsAt: "asc" },
      include: { _count: { select: { applications: { where: { status: AppStatus.PENDING } } } } },
    }),
    prisma.application.findMany({
      where: {
        teamId: ownTeam.id,
        status: { not: AppStatus.ACCEPTED },
        request: { startsAt: { gt: input.now }, team: activeTeamWhere() },
      },
      orderBy: { request: { startsAt: "asc" } },
      select: {
        id: true,
        status: true,
        request: {
          select: {
            id: true,
            startsAt: true,
            format: true,
            team: { select: { id: true, name: true, tag: true, ...teamLogoSelect } },
          },
        },
      },
    }),
  ]);
  // Feedback is given by the acting captain only (SPEC P0-8), like on the scrim page.
  const mayGiveFeedback = actingCaptainProblem(user, ownTeam) === null;
  const items = scrims.map((scrim) => {
    const opponent = scrim.hostTeamId === ownTeam.id ? scrim.guestTeam : scrim.hostTeam;
    const feedbackGiven = scrim.feedback.some((feedback) => feedback.teamId === ownTeam.id);
    return {
      id: scrim.id,
      startsAt: scrim.startsAt,
      format: scrim.format,
      status: scrim.status,
      rankMin: scrim.request.rankMin,
      rankMax: scrim.request.rankMax,
      opponent: {
        id: opponent.id,
        name: opponent.name,
        tag: opponent.tag,
        logo: teamLogoInfo(opponent),
        universities: teamUniversities(opponent.members),
        captainId: opponent.captain.id,
        captainName: opponent.captain.name,
      },
      feedbackGiven,
      canGiveFeedback:
        mayGiveFeedback && !feedbackGiven && feedbackClosedReason(scrim, input.now) === null,
    };
  });
  const isUpcoming = (item: (typeof items)[number]) =>
    item.status === ScrimStatus.SCHEDULED && item.startsAt > input.now;
  const upcoming = items.filter(isUpcoming);
  // The opponent captain's Discord ID, for the "write on Discord" link (SPEC P0-6).
  const captainDiscordIds = await Promise.all(
    upcoming.map((item) => getDiscordId(item.opponent.captainId)),
  );
  return {
    hasTeam: true,
    team: {
      id: ownTeam.id,
      name: ownTeam.name,
      tag: ownTeam.tag,
      logo: await loadTeamLogoInfo(ownTeam),
    },
    upcoming: upcoming.map((item, index) => ({
      ...item,
      opponent: { ...item.opponent, captainDiscordId: captainDiscordIds[index] ?? null },
    })),
    past: items.filter((item) => !isUpcoming(item)).reverse(),
    requests: requests.map((request) => ({
      id: request.id,
      startsAt: request.startsAt,
      format: request.format,
      rankMin: request.rankMin,
      rankMax: request.rankMax,
      maps: request.maps,
      applicationCount: request._count.applications,
    })),
    applications: applications.map((application) => ({
      id: application.id,
      status: application.status,
      requestId: application.request.id,
      startsAt: application.request.startsAt,
      format: application.request.format,
      team: {
        id: application.request.team.id,
        name: application.request.team.name,
        tag: application.request.team.tag,
        logo: teamLogoInfo(application.request.team),
      },
    })),
  };
}
