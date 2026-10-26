// Reads for the board, request and scrim pages (ARCHITECTURE §3 "Lesen", §5.7, §7).
import {
  AppStatus,
  type MemberRole,
  type Prisma,
  type Rank,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import {
  RELIABILITY_WINDOW_DAYS,
  RELIABLE_NO_SHOW_RATE,
  TEAM_SEARCH_MAX,
} from "../config/limits.ts";
import type { Db } from "./db.ts";
import type { Message } from "./i18n/render.ts";
import {
  actingCaptainProblem,
  canSeeApplications,
  findOwnTeam,
  findOwnTeams,
  isCaptainOf,
  isScrimTeam,
  pickActiveTeam,
  requireUser,
} from "./permissions.ts";
import {
  RANKS,
  isOutsideRange,
  loadTeamRank,
  rankValue,
  teamRank,
  teamRankMemberSelect,
} from "./ranks.ts";
import {
  activeTeamWhere,
  hasFullyVerifiedMembers,
  isTeamActive,
  isTeamFullyVerified,
  listedTeamWhere,
} from "./readiness.ts";
import {
  applicantRuleProblem,
  applicantTeamProblem,
  boardRequestWhere,
  isRequestOpen,
  openRequestWhere,
  requestPostingProblems,
} from "./requests.ts";
import { nextSeriesStart, seriesPostsAt } from "./request-series.ts";
import { feedbackClosedReason, isCancellable, isLateCancel } from "./scrims.ts";
import { teamLinksSelect, toTeamLinks } from "./team-links.ts";
import { type TeamLogoInfo, loadTeamLogoInfo, teamLogoInfo, teamLogoSelect } from "./team-logo.ts";
import {
  getMyTeam,
  needsCaptainVerification,
  teamLimitProblem,
  teamUniversities,
  verifiedUniversityNames,
} from "./teams.ts";
import { berlinDayRange, isValidDateString } from "./time.ts";
import { getDiscordId } from "./users.ts";

// ─── Reliability ──────────────────────────────────────────────────────────────

/** The average rating is only shown from this many ratings on (SPEC P0-8). */
export const MIN_RATINGS_SHOWN = 3;

export { RELIABILITY_WINDOW_DAYS, RELIABLE_NO_SHOW_RATE };

const DAY = 24 * 60 * 60 * 1000;

export type Reliability = {
  played: number;
  noShows: number;
  lateCancels: number;
  /** null below MIN_RATINGS_SHOWN ratings. */
  avgRating: number | null;
};

/**
 * Computed on read, never stored (§5.7). Batch variant for lists. Since Phase 27 only scrims that
 * start in the last RELIABILITY_WINDOW_DAYS count (SPEC N-23); late cancellations of future scrims
 * count right away, so the window has no upper bound.
 */
export async function getReliabilities(
  teamIds: string[],
  now: Date,
  db: Db = prisma,
): Promise<Map<string, Reliability>> {
  const ids = [...new Set(teamIds)];
  const recent = { gte: new Date(now.getTime() - RELIABILITY_WINDOW_DAYS * DAY) };
  const result = new Map<string, Reliability>(
    ids.map((id) => [id, { played: 0, noShows: 0, lateCancels: 0, avgRating: null }]),
  );
  if (ids.length === 0) return result;

  const completed = await db.scrim.findMany({
    where: {
      status: ScrimStatus.COMPLETED,
      startsAt: recent,
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
    where: { status: ScrimStatus.NO_SHOW, startsAt: recent, noShowTeamId: { in: ids } },
    _count: { _all: true },
  });
  for (const row of noShows) result.get(row.noShowTeamId!)!.noShows = row._count._all;

  // Cancellations with more than 24 h lead and cancellations due to a ban have lateCancel = false.
  const lateCancels = await db.scrim.groupBy({
    by: ["cancelledByTeamId"],
    where: {
      status: ScrimStatus.CANCELLED,
      lateCancel: true,
      startsAt: recent,
      cancelledByTeamId: { in: ids },
    },
    _count: { _all: true },
  });
  for (const row of lateCancels) result.get(row.cancelledByTeamId!)!.lateCancels = row._count._all;

  return result;
}

export async function getReliability(
  teamId: string,
  now: Date,
  db: Db = prisma,
): Promise<Reliability> {
  return (await getReliabilities([teamId], now, db)).get(teamId)!;
}

/**
 * Reliable: a no-show rate below RELIABLE_NO_SHOW_RATE in the window, no-shows ÷ (played +
 * no-shows); late cancellations do not count, and a team without scrims there is reliable (SPEC
 * N-23).
 */
export function isReliable(reliability: Pick<Reliability, "played" | "noShows">): boolean {
  const total = reliability.played + reliability.noShows;
  return total === 0 || reliability.noShows / total < RELIABLE_NO_SHOW_RATE;
}

// ─── Team cards ───────────────────────────────────────────────────────────────

const teamCardSelect = {
  id: true,
  name: true,
  tag: true,
  verifiedApplicantsOnly: true,
  ...teamLogoSelect,
  members: {
    select: {
      ...teamRankMemberSelect,
      user: {
        select: {
          verifiedAt: true,
          universityOther: true,
          university: { select: { name: true } },
          ...teamRankMemberSelect.user.select,
        },
      },
    },
  },
} satisfies Prisma.TeamSelect;

type TeamCardRow = Prisma.TeamGetPayload<{ select: typeof teamCardSelect }>;

export type TeamCardData = {
  id: string;
  name: string;
  tag: string;
  /** Computed from the members' own ranks; null without any (SPEC N-16). */
  rank: Rank | null;
  /** The team's logos for their URLs; null without logo (§5.11). */
  logo: TeamLogoInfo | null;
  universities: { shown: string[]; more: number };
  reliability: Reliability;
  /** At least 5 verified players or substitutes: the badge (SPEC N-21). */
  fullyVerified: boolean;
};

function toTeamCard(team: TeamCardRow, reliabilities: Map<string, Reliability>): TeamCardData {
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: teamRank(team.members),
    logo: teamLogoInfo(team),
    universities: teamUniversities(team.members),
    reliability: reliabilities.get(team.id)!,
    fullyVerified: hasFullyVerifiedMembers(team.members),
  };
}

// ─── Board ────────────────────────────────────────────────────────────────────

/** The board's filters, shared by the board and the public board (§5.26). */
type BoardFilterInput = {
  /** Berlin calendar date "YYYY-MM-DD"; invalid values are ignored. */
  date?: string | null;
  /**
   * Requests whose range contains one of these ranks; "ALL" = no rank filter. Missing or empty:
   * the board's default (see BoardInput and PublicBoardInput).
   */
  ranks?: readonly Rank[] | "ALL" | null;
  /** Only requests of fully verified teams (SPEC N-21); missing or false = all. */
  fullyVerifiedOnly?: boolean | null;
  /** Only requests of reliable teams (SPEC N-23); missing or false = all. */
  reliableOnly?: boolean | null;
  now: Date;
};

/** ranks: missing or empty = own team rank, without one no rank filter (SPEC N-16). */
export type BoardInput = BoardFilterInput & { userId: string };

/** Without a user; ranks: missing or empty = no rank filter, as there is no own team (SPEC N-24). */
export type PublicBoardInput = BoardFilterInput;

/** The chosen ranks in rank order without duplicates, `fallback` when none; empty = all ranks. */
function chosenRanks(chosen: readonly Rank[] | "ALL" | null | undefined, fallback: Rank[]) {
  if (chosen === "ALL") return [];
  return chosen?.length ? RANKS.filter((rank) => chosen.includes(rank)) : fallback;
}

/**
 * Open, future requests of active teams with the board's filters, as cards (SPEC P0-4, §5.26);
 * `excludeTeamId` leaves out the own team's requests.
 */
async function loadBoardRequests(input: {
  date: string | null | undefined;
  ranks: Rank[];
  fullyVerifiedOnly: boolean;
  reliableOnly: boolean;
  excludeTeamId: string | null;
  now: Date;
}) {
  const { ranks, fullyVerifiedOnly, reliableOnly } = input;
  const date = input.date && isValidDateString(input.date) ? input.date : null;
  const range = date ? berlinDayRange(date) : null;

  // Each filter is its own AND entry, so none can overwrite a condition of the base.
  const filtered: Prisma.ScrimRequestWhereInput = {
    AND: [
      boardRequestWhere(input.now),
      ...(range ? [{ startsAt: { gte: range.from, lt: range.to } }] : []),
      ...(input.excludeTeamId ? [{ teamId: { not: input.excludeTeamId } }] : []),
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

  const found = await prisma.scrimRequest.findMany({
    where: filtered,
    include,
    orderBy: { startsAt: "asc" },
  });
  // Badge and reliability are computed on read, so these filters run after loading (SPEC N-21,
  // N-23); the reliabilities only for the requests the badge filter leaves.
  const verified = fullyVerifiedOnly
    ? found.filter((request) => hasFullyVerifiedMembers(request.team.members))
    : found;
  const reliabilities = await getReliabilities(
    verified.map((request) => request.teamId),
    input.now,
  );
  const requests = reliableOnly
    ? verified.filter((request) => isReliable(reliabilities.get(request.teamId)!))
    : verified;

  return {
    filter: { date, ranks, fullyVerifiedOnly, reliableOnly },
    requests: requests.map((request) => ({
      id: request.id,
      startsAt: request.startsAt,
      format: request.format,
      rankMin: request.rankMin,
      rankMax: request.rankMax,
      maps: request.maps,
      applicationCount: request._count.applications,
      team: toTeamCard(request.team, reliabilities),
      /** The team admits only fully verified applicants (SPEC N-21). */
      verifiedApplicantsOnly: request.team.verifiedApplicantsOnly,
    })),
  };
}

/** Open, future requests of other active teams (SPEC P0-4); the own ones are in getMyScrims. */
export async function getBoard(input: BoardInput) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  const ownRank = ownTeam ? await loadTeamRank(ownTeam.id) : null;
  const { filter, requests } = await loadBoardRequests({
    date: input.date,
    ranks: chosenRanks(input.ranks, ownRank ? [ownRank] : []),
    fullyVerifiedOnly: input.fullyVerifiedOnly === true,
    reliableOnly: input.reliableOnly === true,
    excludeTeamId: ownTeam?.id ?? null,
    now: input.now,
  });
  const ownApplications = ownTeam
    ? await prisma.application.findMany({
        where: { teamId: ownTeam.id, requestId: { in: requests.map((request) => request.id) } },
        select: { requestId: true, status: true },
      })
    : [];

  return {
    ownTeam: ownTeam
      ? { id: ownTeam.id, rank: ownRank, isCaptain: isCaptainOf(user, ownTeam) }
      : null,
    filter,
    requests: requests.map((request) => ({
      ...request,
      ownApplicationStatus:
        ownApplications.find((application) => application.requestId === request.id)?.status ?? null,
    })),
  };
}

/**
 * The board for visitors without login (SPEC N-24, §5.26): the same requests and cards for
 * everyone, without user, own team or rank default; open to all like the landing page (§7).
 */
export async function getPublicBoard(input: PublicBoardInput) {
  return loadBoardRequests({
    date: input.date,
    ranks: chosenRanks(input.ranks, []),
    fullyVerifiedOnly: input.fullyVerifiedOnly === true,
    reliableOnly: input.reliableOnly === true,
    excludeTeamId: null,
    now: input.now,
  });
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
  const [problems, rank] = await Promise.all([
    requestPostingProblems(user, ownTeam, input.now, prisma),
    loadTeamRank(ownTeam.id),
  ]);
  return {
    /** The team the form posts for: the active one (§5.20). */
    teamId: ownTeam.id,
    teamName: ownTeam.name,
    rank,
    /** Where the range of a new request starts: the team rank, without one Iron to Radiant (SPEC N-16). */
    rankRange: rank
      ? { rankMin: rank, rankMax: rank }
      : { rankMin: RANKS[0]!, rankMax: RANKS[RANKS.length - 1]! },
    problems: problems.map(({ kind, text }) => ({ kind, text })),
  };
}

// ─── Request detail ───────────────────────────────────────────────────────────

/**
 * An action a page may offer (§7): null if it does not apply (nothing to show), otherwise
 * problem is null when core allows it, or the reason to show instead.
 */
export type ActionOffer = { problem: Message | null } | null;

/** Teams on the request page: the card, their state and the external links (SPEC N-15). */
const detailTeamSelect = {
  ...teamCardSelect,
  ...teamLinksSelect,
  bannedAt: true,
  dissolvedAt: true,
} satisfies Prisma.TeamSelect;

/**
 * Request for logged-in users; applications only for members of the creating team (§7).
 * null for unknown requests and those of banned or dissolved teams.
 */
export async function getRequestDetail(input: { userId: string; requestId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const request = await prisma.scrimRequest.findUnique({
    where: { id: input.requestId },
    include: {
      team: { select: detailTeamSelect },
      scrim: { select: { id: true, hostTeamId: true, guestTeamId: true } },
    },
  });
  if (!request || !isTeamActive(request.team)) return null;

  const ownTeam = await findOwnTeam(user.id);
  const ownRank = ownTeam ? await loadTeamRank(ownTeam.id) : null;
  const isOwner = ownTeam?.id === request.teamId;
  // Created by another of the user's teams: the page offers to switch to see it as owner (§5.20).
  const otherOwnTeam =
    !isOwner &&
    (await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: request.teamId, userId: user.id } },
      select: { userId: true },
    }))
      ? { id: request.team.id, name: request.team.name }
      : null;
  const showApplications = canSeeApplications(ownTeam?.id, request);
  // Only one of the two ever runs: the creating team sees all applications, others their own.
  const applications = showApplications
    ? await prisma.application.findMany({
        where: { requestId: request.id },
        orderBy: { createdAt: "asc" },
        include: { team: { select: detailTeamSelect } },
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
  const actionProblem = ownTeam ? (actingCaptainProblem(user, ownTeam)?.text ?? null) : null;
  const host = request.team;
  // Applying needs the badge only if the host team admits just fully verified teams (SPEC N-21).
  // The own players are only counted when that decides: applying is offered, nothing else blocks
  // it and the setting is on. Then it runs alongside the reliabilities; null means not counted.
  const countOwnPlayers =
    ownTeam !== null && offersApply && actionProblem === null && host.verifiedApplicantsOnly;
  const [reliabilities, ownFullyVerified, ownMemberCount] = await Promise.all([
    getReliabilities(
      [request.teamId, ...applications.map((application) => application.teamId)],
      input.now,
    ),
    countOwnPlayers ? isTeamFullyVerified(ownTeam.id) : null,
    offersApply ? prisma.teamMember.count({ where: { teamId: ownTeam.id } }) : null,
  ]);
  const ruleProblem =
    ownFullyVerified === null ? null : applicantRuleProblem(host, ownFullyVerified);

  const apply: ActionOffer = offersApply ? { problem: actionProblem ?? ruleProblem } : null;
  const withdraw: ActionOffer =
    ownApplication?.status === AppStatus.PENDING ? { problem: actionProblem } : null;
  // Only the captain can ever delete, so other members do not see it (§7).
  const remove: ActionOffer =
    isOwner && open && isCaptainOf(user, ownTeam) ? { problem: actionProblem } : null;
  const confirm: ActionOffer = offersConfirm ? { problem: actionProblem } : null;
  // The applicant team must still be active, and fully verified if the host requires it, as
  // confirmApplication checks it (findApplicantTeamProblem); here from the loaded members.
  const confirmOffer = (application: (typeof applications)[number]) => {
    if (!confirm || application.status !== AppStatus.PENDING) {
      return { canConfirm: false, teamProblem: null };
    }
    const { team } = application;
    const teamProblem = applicantTeamProblem(team, {
      required: host.verifiedApplicantsOnly,
      fullyVerified: hasFullyVerifiedMembers(team.members),
    });
    return { canConfirm: confirm.problem === null && teamProblem === null, teamProblem };
  };

  return {
    id: request.id,
    status: request.status,
    open,
    /** The team the page shows the request for; its forms act for it (§5.20). */
    actingTeamId: ownTeam?.id ?? null,
    otherOwnTeam,
    startsAt: request.startsAt,
    format: request.format,
    rankMin: request.rankMin,
    rankMax: request.rankMax,
    maps: request.maps,
    note: request.note,
    /** Posted by a weekly series; only the creating team sees that (SPEC N-25). */
    weekly: isOwner && request.seriesId !== null,
    team: { ...toTeamCard(request.team, reliabilities), links: toTeamLinks(request.team) },
    /** The creating team admits only fully verified applicants (SPEC N-21). */
    verifiedApplicantsOnly: host.verifiedApplicantsOnly,
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
    /** Own team rank outside the requested range: allowed, with a hint (SPEC P0-5, N-16). */
    outOfRange: isOutsideRange(ownRank, request),
    ownApplication,
    applications: showApplications
      ? applications.map((application) => ({
          id: application.id,
          status: application.status,
          message: application.message,
          createdAt: application.createdAt,
          outOfRange: isOutsideRange(teamRank(application.team.members), request),
          team: {
            ...toTeamCard(application.team, reliabilities),
            links: toTeamLinks(application.team),
          },
          ...confirmOffer(application),
        }))
      : null,
    scrimId: scrim && isScrimTeam(ownTeam?.id, scrim) ? scrim.id : null,
  };
}

// ─── Scrims ───────────────────────────────────────────────────────────────────

/**
 * Another of the user's teams that plays the scrim while the active one does not (§5.20): the scrim
 * page then offers to switch instead of "not found". null otherwise.
 */
export async function getOtherOwnScrimTeam(input: { userId: string; scrimId: string }) {
  const user = await requireUser(input.userId);
  const scrim = await prisma.scrim.findUnique({
    where: { id: input.scrimId },
    select: { hostTeamId: true, guestTeamId: true },
  });
  if (!scrim || isScrimTeam((await findOwnTeam(user.id))?.id, scrim)) return null;
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId: user.id,
      teamId: { in: [scrim.hostTeamId, scrim.guestTeamId] },
      team: { dissolvedAt: null },
    },
    orderBy: [{ joinedAt: "desc" }, { teamId: "asc" }],
    select: { team: { select: { id: true, name: true } } },
  });
  return membership?.team ?? null;
}

const scrimTeamSelect = {
  id: true,
  name: true,
  tag: true,
  ...teamLinksSelect,
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
  const actionProblem = actingCaptainProblem(user, ownTeam)?.text ?? null;
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
      links: toTeamLinks(opponent),
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
    return {
      hasTeam: false,
      team: null,
      upcoming: [],
      past: [],
      requests: [],
      series: [],
      applications: [],
    };
  }
  const opponentSelect = {
    ...teamCardSelect,
    captain: { select: { id: true, name: true } },
  } satisfies Prisma.TeamSelect;
  const [scrims, requests, runningSeries, applications, ownLogo] = await Promise.all([
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
    prisma.requestSeries.findMany({
      where: { teamId: ownTeam.id, endedAt: null },
      orderBy: { nextStartsAt: "asc" },
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
    loadTeamLogoInfo(ownTeam),
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
  // Running series with a date still to post (SPEC N-25). A due date waits for the reason the
  // sweeper sees: requestPostingProblems for the current captain (§5.27).
  const series = runningSeries.flatMap((entry) => {
    const nextStartsAt = nextSeriesStart(entry, input.now);
    return nextStartsAt ? [{ entry, nextStartsAt, postsAt: seriesPostsAt(nextStartsAt) }] : [];
  });
  const isCaptain = isCaptainOf(user, ownTeam);
  const [blocked] = series.some(({ postsAt }) => postsAt <= input.now)
    ? await requestPostingProblems(
        isCaptain
          ? user
          : await prisma.user.findUniqueOrThrow({
              where: { id: ownTeam.captainId },
              select: { id: true, verifiedAt: true },
            }),
        ownTeam,
        input.now,
        prisma,
      )
    : [];
  // Only the captain can ever end a series, so other members do not see it (§7).
  const end: ActionOffer = isCaptain
    ? { problem: actingCaptainProblem(user, ownTeam)?.text ?? null }
    : null;
  return {
    hasTeam: true,
    team: {
      id: ownTeam.id,
      name: ownTeam.name,
      tag: ownTeam.tag,
      logo: ownLogo,
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
      weekly: request.seriesId !== null,
    })),
    series: series.map(({ entry, nextStartsAt, postsAt }) => ({
      id: entry.id,
      nextStartsAt,
      postsAt,
      lastStartsAt: entry.lastStartsAt,
      format: entry.format,
      rankMin: entry.rankMin,
      rankMax: entry.rankMax,
      maps: entry.maps,
      /** Why the due request waits (limit, unverified captain); null if it is not due yet. */
      blocked: postsAt <= input.now ? (blocked?.kind ?? null) : null,
      end,
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

// ─── Team dashboard ───────────────────────────────────────────────────────────

const dashboardOpponentSelect = {
  id: true,
  name: true,
  tag: true,
  ...teamLogoSelect,
} satisfies Prisma.TeamSelect;

/**
 * The team page as a dashboard (SPEC N-10, §5.14): getMyTeam plus the reliability other teams see
 * on the board and the next upcoming scrim (the rule of "Anstehend": isCancellable). null without
 * a team.
 */
export async function getTeamDashboard(input: { userId: string; now: Date }) {
  const team = await getMyTeam(input.userId);
  if (!team) return null;
  const [reliability, scrim] = await Promise.all([
    getReliability(team.id, input.now),
    prisma.scrim.findFirst({
      where: {
        status: ScrimStatus.SCHEDULED,
        startsAt: { gt: input.now },
        OR: [{ hostTeamId: team.id }, { guestTeamId: team.id }],
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
        startsAt: true,
        format: true,
        hostTeamId: true,
        hostTeam: { select: dashboardOpponentSelect },
        guestTeam: { select: dashboardOpponentSelect },
      },
    }),
  ]);
  const opponent = scrim ? (scrim.hostTeamId === team.id ? scrim.guestTeam : scrim.hostTeam) : null;
  return {
    ...team,
    reliability,
    nextScrim:
      scrim && opponent && isCancellable(scrim, input.now)
        ? {
            id: scrim.id,
            startsAt: scrim.startsAt,
            format: scrim.format,
            opponent: {
              id: opponent.id,
              name: opponent.name,
              tag: opponent.tag,
              logo: teamLogoInfo(opponent),
            },
          }
        : null,
  };
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/**
 * The own teams for the sidebar (§5.15, §5.20): name, tag and logo, which every signed-in user sees
 * on team cards anyway, the active one marked, and the limit for „Neues Team erstellen“. Like the
 * team page only for active accounts (requireUser).
 */
export async function getNavTeam(userId: string) {
  const user = await requireUser(userId);
  const own = await findOwnTeams(user.id);
  const active = pickActiveTeam(own, user.activeTeamId);
  // Outside a transaction, so the logos load in parallel; every page asks for this.
  const teams = await Promise.all(
    [...own]
      .sort((a, b) => a.name.localeCompare(b.name, "de"))
      .map(async (team) => ({
        id: team.id,
        name: team.name,
        tag: team.tag,
        logo: await loadTeamLogoInfo(team),
        active: team === active,
      })),
  );
  return {
    team: teams.find((team) => team.active) ?? null,
    teams,
    teamCount: own.length,
    teamLimit: user.teamLimit,
    /** Why no further team can be founded or joined (SPEC N-17), or null. */
    limitProblem: teamLimitProblem(own.length, user.teamLimit),
    /** The warning dot: unverified captain of an active team (SPEC N-21). */
    verificationNeeded: needsCaptainVerification(user, own),
  };
}

// ─── Teams list ───────────────────────────────────────────────────────────────

export { TEAM_SEARCH_MAX };

export type TeamListInput = {
  userId: string;
  /** Part of a team name, tag or university; trimmed, cut to TEAM_SEARCH_MAX, empty = all. */
  search?: string | null;
  /** Teams whose team rank is one of these; missing, empty or "ALL" = no rank filter. */
  ranks?: readonly Rank[] | "ALL" | null;
  /** Only fully verified teams (SPEC N-21); missing or false = all. */
  fullyVerifiedOnly?: boolean | null;
  /** Only reliable teams (SPEC N-23); missing or false = all. */
  reliableOnly?: boolean | null;
  now: Date;
};

export type TeamListMember = {
  id: string;
  name: string;
  role: MemberRole;
  isCaptain: boolean;
  /** The member's own rank; the list shows it to everyone (SPEC N-20). */
  rank: Rank | null;
};

export type TeamListEntry = {
  id: string;
  name: string;
  tag: string;
  rank: Rank | null;
  logo: TeamLogoInfo | null;
  universities: { shown: string[]; more: number };
  /** At least 5 verified players or substitutes: the badge (SPEC N-21). */
  fullyVerified: boolean;
  /** Of the last RELIABILITY_WINDOW_DAYS, like on the board (SPEC N-23). */
  reliability: Reliability;
  members: TeamListMember[];
};

const teamListSelect = {
  id: true,
  name: true,
  tag: true,
  captainId: true,
  ...teamLogoSelect,
  members: {
    // The order of the members tab.
    orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
    select: {
      ...teamRankMemberSelect,
      user: {
        select: {
          id: true,
          name: true,
          verifiedAt: true,
          universityOther: true,
          university: { select: { name: true } },
          ...teamRankMemberSelect.user.select,
        },
      },
    },
  },
} satisfies Prisma.TeamSelect;

/**
 * All active teams their captain has not hidden, with universities, team rank, reliability and
 * members (SPEC N-20, N-23, §5.23), for every active account like the board. All filters run after
 * loading, because team rank, badge and reliability are computed on read (§5.19, §5.24, §5.25);
 * the reliabilities only for the teams the other filters leave.
 */
export async function getTeamList(input: TeamListInput) {
  await requireUser(input.userId);
  // Cut by code points, then trimmed again: no half emoji, no trailing space.
  const search = Array.from((input.search ?? "").trim())
    .slice(0, TEAM_SEARCH_MAX)
    .join("")
    .trim();
  const ranks = chosenRanks(input.ranks, []);
  const fullyVerifiedOnly = input.fullyVerifiedOnly === true;
  const reliableOnly = input.reliableOnly === true;
  const needle = search.toLocaleLowerCase("de");
  const matches = (text: string | null) => !!text && text.toLocaleLowerCase("de").includes(needle);

  const rows = await prisma.team.findMany({
    where: listedTeamWhere(),
    select: teamListSelect,
  });
  const candidates = rows
    .map((team) => ({
      team,
      rank: teamRank(team.members),
      fullyVerified: hasFullyVerifiedMembers(team.members),
    }))
    .filter(({ rank }) => ranks.length === 0 || (rank !== null && ranks.includes(rank)))
    .filter(({ fullyVerified }) => !fullyVerifiedOnly || fullyVerified)
    .filter(
      ({ team }) =>
        !needle ||
        matches(team.name) ||
        matches(team.tag) ||
        verifiedUniversityNames(team.members).some(matches),
    );
  // One batch for the teams left, like the board (SPEC N-23).
  const reliabilities = await getReliabilities(
    candidates.map(({ team }) => team.id),
    input.now,
  );
  const teams: TeamListEntry[] = candidates
    .map((entry) => ({ ...entry, reliability: reliabilities.get(entry.team.id)! }))
    .filter(({ reliability }) => !reliableOnly || isReliable(reliability))
    .sort((a, b) => a.team.name.localeCompare(b.team.name, "de"))
    .map(({ team, rank, fullyVerified, reliability }) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      rank,
      logo: teamLogoInfo(team),
      universities: teamUniversities(team.members),
      fullyVerified,
      reliability,
      members: team.members.map(({ role, user }) => ({
        id: user.id,
        name: user.name,
        role,
        isCaptain: isCaptainOf(user, team),
        rank: user.rank,
      })),
    }));
  return { teams, filter: { search, ranks, fullyVerifiedOnly, reliableOnly } };
}
