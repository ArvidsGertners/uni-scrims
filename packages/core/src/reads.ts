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
  LANDING_SHOWCASE_MAX,
  RELIABILITY_WINDOW_DAYS,
  RELIABLE_NO_SHOW_RATE,
  TEAM_SEARCH_MAX,
} from "../config/limits.ts";
import type { Db } from "./db.ts";
import { oplTeamUrl } from "./opl/url.ts";
import {
  type League,
  type UniligaLeagues,
  chosenLeagues,
  getUniligaLeagues,
  leagueOf,
} from "./opl/uniliga.ts";
import type { Message } from "./i18n/render.ts";
import { conversationKeyOf, conversationViews, unreadConversationKeys } from "./messages.ts";
import {
  actingCaptainProblem,
  canSeeApplications,
  canSeeRequest,
  captainProblem,
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
  showcaseTeamWhere,
} from "./readiness.ts";
import {
  applicantRuleProblem,
  applicantTeamProblem,
  boardRequestWhere,
  directRequestTargetProblem,
  isRequestOpen,
  openRequestWhere,
  requestPostingProblems,
  runningReadyWindowWhere,
} from "./requests.ts";
import { readyWindowStartOptions, readyWindowStarts } from "./ready-windows.ts";
import { nextSeriesStart, seriesPostsAt, unverifiedCaptainTeams } from "./request-series.ts";
import { feedbackClosedReason, isCancellable, isLateCancel } from "./scrims.ts";
import { teamLinksSelect, toTeamLinks } from "./team-links.ts";
import { type TeamLogoInfo, loadTeamLogoInfo, teamLogoInfo, teamLogoSelect } from "./team-logo.ts";
import {
  getMyTeam,
  needsCaptainVerification,
  showcaseQuestionTeams,
  teamLimitProblem,
  teamUniversities,
  verifiedUniversityNames,
} from "./teams.ts";
import { berlinDayRange, isValidDateString, scrimEveningDate } from "./time.ts";
import { getDiscordId } from "./users.ts";

// ─── Reliability ──────────────────────────────────────────────────────────────

/** The average rating is only shown from this many ratings on (SPEC P0-8). */
export const MIN_RATINGS_SHOWN = 3;

export { LANDING_SHOWCASE_MAX, RELIABILITY_WINDOW_DAYS, RELIABLE_NO_SHOW_RATE };

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
  oplTeamId: true,
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
  /** Uniliga league of a linked team in the current season's group stage (SPEC N-36). */
  league: League | null;
};

function toTeamCard(
  team: TeamCardRow,
  reliabilities: Map<string, Reliability>,
  leagues: UniligaLeagues,
): TeamCardData {
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    rank: teamRank(team.members),
    logo: teamLogoInfo(team),
    universities: teamUniversities(team.members),
    reliability: reliabilities.get(team.id)!,
    fullyVerified: hasFullyVerifiedMembers(team.members),
    league: leagueOf(leagues, team.oplTeamId),
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
  /** Only teams in these Uniliga leagues (SPEC N-36); missing or empty = all, unknown ones dropped. */
  leagues?: readonly number[] | null;
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
 * A rank range (rankMin to rankMax) that contains one of `ranks`, for requests and ready windows.
 * Enums have no order in Prisma filters, so the bounds are matched against the rank list.
 */
function rankRangeWhere(ranks: Rank[]) {
  return {
    OR: ranks.map((rank) => ({
      rankMin: { in: RANKS.slice(0, rankValue(rank)) },
      rankMax: { in: RANKS.slice(rankValue(rank) - 1) },
    })),
  };
}

/** The board's date filter: a valid Berlin date and its day, or null for all days. */
function boardDay(date: string | null | undefined) {
  const valid = date && isValidDateString(date) ? date : null;
  return { date: valid, range: valid ? berlinDayRange(valid) : null };
}

/**
 * Open, future requests of active teams with the board's filters, as cards (SPEC P0-4, §5.26);
 * `excludeTeamId` leaves out the own team's requests.
 */
type BoardLoadInput = {
  date: string | null | undefined;
  ranks: Rank[];
  fullyVerifiedOnly: boolean;
  reliableOnly: boolean;
  /** Normalised by chosenLeagues; empty = all. */
  leagues: number[];
  uniliga: UniligaLeagues;
  excludeTeamId: string | null;
  now: Date;
};

/** All leagues of the current season, for the board, whose teams are only known after loading. */
function loadAllLeagues() {
  return getUniligaLeagues("all");
}

/** The Uniliga filter on a loaded team (SPEC N-36): empty = all, else a linked team in one of them. */
function inChosenLeagues(leagues: number[], uniliga: UniligaLeagues, oplTeamId: number | null) {
  if (leagues.length === 0) return true;
  const league = leagueOf(uniliga, oplTeamId);
  return league !== null && leagues.includes(league.division);
}

async function loadBoardRequests(input: BoardLoadInput) {
  const { ranks, fullyVerifiedOnly, reliableOnly, leagues, uniliga } = input;
  const { date, range } = boardDay(input.date);

  // Each filter is its own AND entry, so none can overwrite a condition of the base.
  const filtered: Prisma.ScrimRequestWhereInput = {
    AND: [
      boardRequestWhere(input.now),
      ...(range ? [{ startsAt: { gte: range.from, lt: range.to } }] : []),
      ...(input.excludeTeamId ? [{ teamId: { not: input.excludeTeamId } }] : []),
      ...(ranks.length > 0 ? [rankRangeWhere(ranks)] : []),
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
  const verified = found.filter(
    (request) =>
      (!fullyVerifiedOnly || hasFullyVerifiedMembers(request.team.members)) &&
      inChosenLeagues(leagues, uniliga, request.team.oplTeamId),
  );
  const reliabilities = await getReliabilities(
    verified.map((request) => request.teamId),
    input.now,
  );
  const requests = reliableOnly
    ? verified.filter((request) => isReliable(reliabilities.get(request.teamId)!))
    : verified;

  return {
    filter: { date, ranks, fullyVerifiedOnly, reliableOnly, leagues },
    requests: requests.map((request) => ({
      id: request.id,
      startsAt: request.startsAt,
      format: request.format,
      rankMin: request.rankMin,
      rankMax: request.rankMax,
      maps: request.maps,
      applicationCount: request._count.applications,
      team: toTeamCard(request.team, reliabilities, uniliga),
      /** The team admits only fully verified applicants (SPEC N-21). */
      verifiedApplicantsOnly: request.team.verifiedApplicantsOnly,
    })),
  };
}

/**
 * Running ready windows of active teams with the board's filters, as cards (SPEC N-27, §5.29),
 * ordered by their earliest start time still to request. The day filter keeps windows with such a
 * start time on that day; badge and reliability filter after loading, as for requests.
 */
async function loadReadyWindows(input: BoardLoadInput) {
  const { range } = boardDay(input.date);
  const found = await prisma.readyWindow.findMany({
    where: {
      AND: [
        runningReadyWindowWhere(input.now),
        ...(input.excludeTeamId ? [{ teamId: { not: input.excludeTeamId } }] : []),
        ...(input.ranks.length > 0 ? [rankRangeWhere(input.ranks)] : []),
      ],
    },
    include: { team: { select: teamCardSelect } },
  });
  const withOptions = found
    .map((window) => ({ window, startOptions: readyWindowStartOptions(window, input.now) }))
    .filter(
      ({ startOptions }) =>
        startOptions.length > 0 &&
        (!range || startOptions.some((start) => start >= range.from && start < range.to)),
    )
    .filter(
      ({ window }) =>
        (!input.fullyVerifiedOnly || hasFullyVerifiedMembers(window.team.members)) &&
        inChosenLeagues(input.leagues, input.uniliga, window.team.oplTeamId),
    )
    .sort((a, b) => a.startOptions[0]!.getTime() - b.startOptions[0]!.getTime());
  const reliabilities = await getReliabilities(
    withOptions.map(({ window }) => window.teamId),
    input.now,
  );
  return withOptions
    .filter(({ window }) => !input.reliableOnly || isReliable(reliabilities.get(window.teamId)!))
    .map(({ window, startOptions }) => ({
      id: window.id,
      /** The start times still to request, from the earliest; never empty. */
      startOptions,
      lastStartsAt: window.lastStartsAt,
      format: window.format,
      rankMin: window.rankMin,
      rankMax: window.rankMax,
      maps: window.maps,
      team: toTeamCard(window.team, reliabilities, input.uniliga),
    }));
}

/** The running ready window of a team, with its open requests counted (SPEC N-27). */
async function loadOwnReadyWindow(teamId: string, now: Date) {
  return prisma.readyWindow.findFirst({
    where: { teamId, ...runningReadyWindowWhere(now) },
    include: { _count: { select: { requests: { where: openRequestWhere(now) } } } },
  });
}

/** Open, future requests of other active teams (SPEC P0-4); the own ones are in getMyScrims. */
export async function getBoard(input: BoardInput) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  const [ownRank, uniliga] = await Promise.all([
    ownTeam ? loadTeamRank(ownTeam.id) : null,
    loadAllLeagues(),
  ]);
  const filters = {
    date: input.date,
    ranks: chosenRanks(input.ranks, ownRank ? [ownRank] : []),
    fullyVerifiedOnly: input.fullyVerifiedOnly === true,
    reliableOnly: input.reliableOnly === true,
    leagues: chosenLeagues(input.leagues, uniliga.options),
    uniliga,
    excludeTeamId: ownTeam?.id ?? null,
    now: input.now,
  };
  const [{ filter, requests }, readyWindows, ownReadyWindow] = await Promise.all([
    loadBoardRequests(filters),
    loadReadyWindows(filters),
    ownTeam ? loadOwnReadyWindow(ownTeam.id, input.now) : null,
  ]);
  const [ownApplications, ownWindowRequests, [postingProblem]] = ownTeam
    ? await Promise.all([
        prisma.application.findMany({
          where: { teamId: ownTeam.id, requestId: { in: requests.map((request) => request.id) } },
          select: { requestId: true, status: true },
        }),
        prisma.scrimRequest.findMany({
          where: {
            teamId: ownTeam.id,
            readyWindowId: { in: readyWindows.map((window) => window.id) },
          },
          select: { id: true, readyWindowId: true, status: true, startsAt: true },
        }),
        // Requesting from a window is a direct request: the reasons of the request form (§7).
        readyWindows.length > 0
          ? requestPostingProblems(user, ownTeam, input.now, prisma)
          : Promise.resolve([]),
      ])
    : [[], [], []];
  const isCaptain = ownTeam !== null && isCaptainOf(user, ownTeam);

  return {
    ownTeam: ownTeam ? { id: ownTeam.id, rank: ownRank, isCaptain } : null,
    filter,
    /** The leagues of the current Uniliga season for the filter; empty without one (SPEC N-36). */
    leagueOptions: uniliga.options,
    requests: requests.map((request) => ({
      ...request,
      ownApplicationStatus:
        ownApplications.find((application) => application.requestId === request.id)?.status ?? null,
    })),
    /** Other teams' windows for today (SPEC N-27), with what the active team can do there. */
    readyWindows: readyWindows.map((window) => {
      const ownRequest = ownWindowRequests.find((request) => request.readyWindowId === window.id);
      return {
        ...window,
        /** The active team's request for this window: one per team, also after a decline. */
        ownRequest: ownRequest
          ? {
              id: ownRequest.id,
              status: ownRequest.status,
              open: isRequestOpen(ownRequest, input.now),
            }
          : null,
        /** Requesting a start time; null without a team or once the team has requested. */
        request: (ownTeam && !ownRequest
          ? { problem: postingProblem?.text ?? null }
          : null) satisfies ActionOffer,
      };
    }),
    /** The active team's running window, shown to all members; ending it only for the captain. */
    ownReadyWindow: ownReadyWindow
      ? {
          id: ownReadyWindow.id,
          firstStartsAt: ownReadyWindow.firstStartsAt,
          lastStartsAt: ownReadyWindow.lastStartsAt,
          format: ownReadyWindow.format,
          rankMin: ownReadyWindow.rankMin,
          rankMax: ownReadyWindow.rankMax,
          maps: ownReadyWindow.maps,
          openRequestCount: ownReadyWindow._count.requests,
          end: (isCaptain
            ? { problem: actingCaptainProblem(user, ownTeam!)?.text ?? null }
            : null) satisfies ActionOffer,
        }
      : null,
  };
}

/**
 * The board for visitors without login (SPEC N-24, §5.26): the same requests and cards for
 * everyone, without user, own team or rank default; open to all like the landing page (§7).
 */
export async function getPublicBoard(input: PublicBoardInput) {
  const uniliga = await loadAllLeagues();
  const filters = {
    date: input.date,
    ranks: chosenRanks(input.ranks, []),
    fullyVerifiedOnly: input.fullyVerifiedOnly === true,
    reliableOnly: input.reliableOnly === true,
    leagues: chosenLeagues(input.leagues, uniliga.options),
    uniliga,
    excludeTeamId: null,
    now: input.now,
  };
  const [{ filter, requests }, readyWindows] = await Promise.all([
    loadBoardRequests(filters),
    loadReadyWindows(filters),
  ]);
  return { filter, leagueOptions: uniliga.options, requests, readyWindows };
}

// ─── Request form ─────────────────────────────────────────────────────────────

/**
 * Form "Anfrage erstellen": null without a team. problems are requestPostingProblems, the list
 * createRequest throws the first entry of under the team lock, so nobody fills in the form in vain:
 * the captain sees every reason at once, other members only that the captain has to act, and a
 * ban is the only reason. kind lets the page link to where each one is fixed (§7).
 */
export async function getRequestForm(input: {
  userId: string;
  now: Date;
  /** A direct request to this team (SPEC N-26); missing = a request for the board. */
  targetTeamId?: string | null;
}) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  if (!ownTeam) return null;
  const [problems, rank, target] = await Promise.all([
    requestPostingProblems(user, ownTeam, input.now, prisma),
    loadTeamRank(ownTeam.id),
    input.targetTeamId ? loadDirectRequestTarget(ownTeam.id, input.targetTeamId, input.now) : null,
  ]);
  return {
    /** The team a direct request goes to, or why it cannot; null for a board request. */
    target,
    /** The team the form posts for: the active one (§5.20). */
    teamId: ownTeam.id,
    teamName: ownTeam.name,
    rank,
    /** Where the range of a new request starts: the team rank, without one Iron to Radiant (SPEC N-16). */
    rankRange: defaultRankRange(rank),
    problems: problems.map(({ kind, text }) => ({ kind, text })),
  };
}

function defaultRankRange(rank: Rank | null): { rankMin: Rank; rankMax: Rank } {
  return rank
    ? { rankMin: rank, rankMax: rank }
    : { rankMin: RANKS[0]!, rankMax: RANKS[RANKS.length - 1]! };
}

/**
 * Form "Heute spielbereit" (SPEC N-27): null without a team. problems is the reason
 * createReadyWindow rejects with regardless of the input (actingCaptainProblem, no request limit);
 * running is the team's window, which has to end before a new one; starts are the start
 * times still to offer this evening, empty when it is too late (§5.29).
 */
export async function getReadyWindowForm(input: { userId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const ownTeam = await findOwnTeam(user.id);
  if (!ownTeam) return null;
  const [rank, running] = await Promise.all([
    loadTeamRank(ownTeam.id),
    prisma.readyWindow.findFirst({
      where: { teamId: ownTeam.id, ...runningReadyWindowWhere(input.now) },
      select: { id: true, firstStartsAt: true, lastStartsAt: true },
    }),
  ]);
  // The one reason createReadyWindow throws regardless of the input (no request limit).
  const problems = [actingCaptainProblem(user, ownTeam)].filter((problem) => problem !== null);
  return {
    /** The team the form announces: the active one (§5.20). */
    teamId: ownTeam.id,
    teamName: ownTeam.name,
    rankRange: defaultRankRange(rank),
    /** The day of the evening the times belong to, sent back with them (createReadyWindow). */
    evening: scrimEveningDate(input.now),
    starts: readyWindowStarts(input.now),
    running,
    problems: problems.map(({ kind, text }) => ({ kind, text })),
  };
}

/** The card of a direct request's target for the form, or the problem createRequest would throw. */
async function loadDirectRequestTarget(ownTeamId: string, targetTeamId: string, now: Date) {
  const team = await prisma.team.findUnique({
    where: { id: targetTeamId },
    select: { ...teamCardSelect, bannedAt: true, dissolvedAt: true },
  });
  const problem = directRequestTargetProblem(ownTeamId, team);
  if (problem || !team) return { team: null, problem: problem?.text ?? null };
  const [reliabilities, uniliga] = await Promise.all([
    getReliabilities([team.id], now),
    getUniligaLeagues([team.oplTeamId]),
  ]);
  return { team: toTeamCard(team, reliabilities, uniliga), problem: null };
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
 * Request for logged-in users; applications only for members of the creating team (§7). A direct
 * request only for members of the requesting and the requested team (SPEC N-26).
 * null for unknown requests, those of banned or dissolved teams and direct requests of others.
 */
export async function getRequestDetail(input: { userId: string; requestId: string; now: Date }) {
  const user = await requireUser(input.userId);
  const request = await prisma.scrimRequest.findUnique({
    where: { id: input.requestId },
    include: {
      team: { select: detailTeamSelect },
      targetTeam: { select: detailTeamSelect },
      scrim: { select: { id: true, hostTeamId: true, guestTeamId: true } },
    },
  });
  if (!request || !isTeamActive(request.team)) return null;
  // The user's memberships in the request's teams: the creating one and, for a direct request, the
  // requested one (dissolved teams have no memberships left, the filter covers leftovers).
  const [memberOf, ownTeam] = await Promise.all([
    prisma.teamMember.findMany({
      where: {
        userId: user.id,
        teamId: { in: [request.teamId, request.targetTeamId].filter((id) => id !== null) },
        team: { dissolvedAt: null },
      },
      select: { teamId: true },
    }),
    findOwnTeam(user.id),
  ]);
  const memberTeamIds = memberOf.map((entry) => entry.teamId);
  if (!canSeeRequest(memberTeamIds, request)) return null;

  const ownRank = ownTeam ? await loadTeamRank(ownTeam.id) : null;
  const isOwner = ownTeam?.id === request.teamId;
  const isTarget = request.targetTeamId !== null && ownTeam?.id === request.targetTeamId;
  // Created by, or for a direct request sent to, another of the user's teams: the page offers to
  // switch to that team (§5.20). The requested team is never pointed away from its answer.
  const otherTeam = isTarget
    ? null
    : !isOwner && memberTeamIds.includes(request.teamId)
      ? request.team
      : request.targetTeamId && memberTeamIds.includes(request.targetTeamId)
        ? request.targetTeam
        : null;
  const otherOwnTeam = otherTeam ? { id: otherTeam.id, name: otherTeam.name } : null;
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
  // A direct request takes no applications (SPEC N-26).
  const offersApply =
    open && ownTeam !== null && !isOwner && !ownApplication && request.targetTeamId === null;
  const pending = applications.filter((application) => application.status === AppStatus.PENDING);
  const offersConfirm = isOwner && open && pending.length > 0;
  const actionProblem = ownTeam ? (actingCaptainProblem(user, ownTeam)?.text ?? null) : null;
  const host = request.team;
  // Applying needs the badge only if the host team admits just fully verified teams (SPEC N-21).
  // The own players are only counted when that decides: applying is offered, nothing else blocks
  // it and the setting is on. Then it runs alongside the reliabilities; null means not counted.
  const countOwnPlayers =
    ownTeam !== null && offersApply && actionProblem === null && host.verifiedApplicantsOnly;
  // The threads with the other team (SPEC N-28): of a direct request for both teams, of every
  // application for the creating team, of the own application for an applicant.
  const guestTeamIds = !ownTeam
    ? []
    : request.targetTeamId !== null
      ? isOwner || isTarget
        ? [request.targetTeamId]
        : []
      : isOwner
        ? applications.map((application) => application.teamId)
        : ownApplication
          ? [ownTeam.id]
          : [];
  const [reliabilities, uniliga, ownFullyVerified, ownMemberCount, threads] = await Promise.all([
    getReliabilities(
      [
        request.teamId,
        ...(request.targetTeamId ? [request.targetTeamId] : []),
        ...applications.map((application) => application.teamId),
      ],
      input.now,
    ),
    getUniligaLeagues([
      request.team.oplTeamId,
      request.targetTeam?.oplTeamId ?? null,
      ...applications.map((application) => application.team.oplTeamId),
    ]),
    countOwnPlayers ? isTeamFullyVerified(ownTeam.id) : null,
    offersApply ? prisma.teamMember.count({ where: { teamId: ownTeam.id } }) : null,
    ownTeam
      ? conversationViews({
          userId: user.id,
          teamId: ownTeam.id,
          requestId: request.id,
          guestTeamIds,
          now: input.now,
        })
      : [],
  ]);
  const thread = (guestTeamId: string) =>
    threads.find((entry) => entry.guestTeamId === guestTeamId) ?? null;
  const ruleProblem =
    ownFullyVerified === null ? null : applicantRuleProblem(host, ownFullyVerified);

  const apply: ActionOffer = offersApply ? { problem: actionProblem ?? ruleProblem } : null;
  const withdraw: ActionOffer =
    ownApplication?.status === AppStatus.PENDING ? { problem: actionProblem } : null;
  // Only the captain can ever delete, so other members do not see it (§7).
  const remove: ActionOffer =
    isOwner && open && isCaptainOf(user, ownTeam) ? { problem: actionProblem } : null;
  const confirm: ActionOffer = offersConfirm ? { problem: actionProblem } : null;
  // Accepting and declining a direct request: only the requested team's captain (SPEC N-26).
  const answer: ActionOffer =
    isTarget && open && isCaptainOf(user, ownTeam) ? { problem: actionProblem } : null;
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
    /**
     * Posted by a weekly series; only the creating team sees that (SPEC N-25), for a fixed
     * partnership both teams (SPEC N-26).
     */
    weekly: (isOwner || isTarget) && request.seriesId !== null,
    team: {
      ...toTeamCard(request.team, reliabilities, uniliga),
      links: toTeamLinks(request.team),
    },
    /**
     * A direct request (SPEC N-26): the requested team, the last date of a proposed partnership,
     * and whether the page shows it to the requested team.
     */
    direct: request.targetTeam
      ? {
          target: {
            ...toTeamCard(request.targetTeam, reliabilities, uniliga),
            links: toTeamLinks(request.targetTeam),
          },
          weeklyUntil: request.weeklyLastStartsAt,
          incoming: isTarget,
          /** For a start time in the requested team's window "Heute spielbereit" (SPEC N-27). */
          readyWindow: request.readyWindowId !== null,
        }
      : null,
    /** Accept or decline a direct request, for the requested team's captain. */
    accept: answer,
    decline: answer,
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
    /**
     * The thread with the other team for an applicant or either team of a direct request (SPEC
     * N-28); the creating team of a board request has one per application.
     */
    conversation:
      ownTeam && !(isOwner && request.targetTeamId === null)
        ? thread(request.targetTeamId ?? ownTeam.id)
        : null,
    applications: showApplications
      ? applications.map((application) => ({
          id: application.id,
          status: application.status,
          message: application.message,
          createdAt: application.createdAt,
          outOfRange: isOutsideRange(teamRank(application.team.members), request),
          team: {
            ...toTeamCard(application.team, reliabilities, uniliga),
            links: toTeamLinks(application.team),
          },
          conversation: thread(application.teamId),
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
  bannedAt: true,
  dissolvedAt: true,
  ...teamLinksSelect,
  ...teamLogoSelect,
  captain: { select: { id: true, name: true } },
  members: {
    select: {
      user: {
        select: { verifiedAt: true, universityOther: true, university: { select: { name: true } } },
      },
    },
  },
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
      request: { select: { note: true, targetTeamId: true } },
      feedback: { select: { teamId: true, outcome: true, rating: true } },
    },
  });
  if (!scrim || !ownTeam || !isScrimTeam(ownTeam.id, scrim)) return null;

  const isHost = scrim.hostTeamId === ownTeam.id;
  const opponent = isHost ? scrim.guestTeam : scrim.hostTeam;
  const actionProblem = actingCaptainProblem(user, ownTeam)?.text ?? null;
  const ownFeedback = scrim.feedback.find((feedback) => feedback.teamId === ownTeam.id) ?? null;
  const feedbackClosed = feedbackClosedReason(scrim, input.now);
  const [opponentCaptainDiscordId, threads] = await Promise.all([
    getDiscordId(opponent.captain.id),
    // The thread with the opponent, continued from the application or direct request (SPEC N-28).
    conversationViews({
      userId: user.id,
      teamId: ownTeam.id,
      requestId: scrim.requestId,
      guestTeamIds: [scrim.guestTeamId],
      now: input.now,
    }),
  ]);

  return {
    id: scrim.id,
    status: scrim.status,
    startsAt: scrim.startsAt,
    format: scrim.format,
    maps: scrim.maps,
    note: scrim.request.note,
    feedbackDeadline: scrim.feedbackDeadline,
    isHost,
    /** Booked from a direct request (SPEC N-26): the host asked the guest directly. */
    direct: scrim.request.targetTeamId !== null,
    ownTeam: { id: ownTeam.id, name: ownTeam.name, tag: ownTeam.tag },
    /** The opponent's current captain is visible after booking (SPEC P0-6). */
    opponent: {
      id: opponent.id,
      name: opponent.name,
      tag: opponent.tag,
      /** For the head of the chat (SPEC N-28). */
      logo: teamLogoInfo(opponent),
      universities: teamUniversities(opponent.members),
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
    /**
     * "Nochmal gegen dieses Team" (SPEC N-26): for the captain, once the scrim is past or cancelled,
     * while the opponent is active. The page prefills format, maps and time from the scrim.
     */
    rematch:
      captainProblem(user, ownTeam) === null &&
      isTeamActive(opponent) &&
      !isUpcomingScrim(scrim, input.now),
    conversation: threads[0] ?? null,
  };
}

/** Scheduled and in the future: "Anstehend"; every other scrim is past (vorbei oder abgesagt). */
function isUpcomingScrim(scrim: { status: ScrimStatus; startsAt: Date }, now: Date): boolean {
  return scrim.status === ScrimStatus.SCHEDULED && scrim.startsAt > now;
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
      incoming: [],
      series: [],
      applications: [],
    };
  }
  const opponentSelect = {
    ...teamCardSelect,
    bannedAt: true,
    dissolvedAt: true,
    captain: { select: { id: true, name: true } },
  } satisfies Prisma.TeamSelect;
  const smallTeamSelect = { id: true, name: true, tag: true, ...teamLogoSelect };
  const seriesTeamSelect = {
    ...smallTeamSelect,
    captain: { select: { verifiedAt: true } },
  } satisfies Prisma.TeamSelect;
  const smallTeam = (team: Prisma.TeamGetPayload<{ select: typeof smallTeamSelect }>) => ({
    id: team.id,
    name: team.name,
    tag: team.tag,
    logo: teamLogoInfo(team),
  });
  const [scrims, requests, incoming, runningSeries, applications, ownLogo] = await Promise.all([
    prisma.scrim.findMany({
      where: { OR: [{ hostTeamId: ownTeam.id }, { guestTeamId: ownTeam.id }] },
      orderBy: { startsAt: "asc" },
      include: {
        hostTeam: { select: opponentSelect },
        guestTeam: { select: opponentSelect },
        request: { select: { rankMin: true, rankMax: true, targetTeamId: true } },
        feedback: { select: { teamId: true } },
      },
    }),
    prisma.scrimRequest.findMany({
      where: { ...openRequestWhere(input.now), teamId: ownTeam.id },
      orderBy: { startsAt: "asc" },
      include: {
        targetTeam: { select: smallTeamSelect },
        _count: { select: { applications: { where: { status: AppStatus.PENDING } } } },
      },
    }),
    // Direct requests to the team (SPEC N-26), from active teams like the board.
    prisma.scrimRequest.findMany({
      where: { ...openRequestWhere(input.now), targetTeamId: ownTeam.id, team: activeTeamWhere() },
      orderBy: { startsAt: "asc" },
      include: { team: { select: smallTeamSelect } },
    }),
    // The team's series and the fixed partnerships it is the partner of (§5.28).
    prisma.requestSeries.findMany({
      where: { OR: [{ teamId: ownTeam.id }, { targetTeamId: ownTeam.id }], endedAt: null },
      orderBy: { id: "asc" },
      include: { team: { select: seriesTeamSelect }, targetTeam: { select: seriesTeamSelect } },
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
  // Threads with unread messages of the other team (SPEC N-28), for the "Neu" markers.
  const unread = await unreadConversationKeys(prisma, {
    userId: user.id,
    teamId: ownTeam.id,
    requestIds: [
      ...scrims.map((scrim) => scrim.requestId),
      ...requests.map((request) => request.id),
      ...incoming.map((request) => request.id),
      ...applications.map((application) => application.request.id),
    ],
  });
  const unreadRequestIds = new Set([...unread].map((key) => key.split(":")[0]));
  const unreadAsGuest = (requestId: string) =>
    unread.has(conversationKeyOf({ requestId, guestTeamId: ownTeam.id }));
  // Feedback is given by the acting captain only (SPEC P0-8), like on the scrim page.
  const mayGiveFeedback = actingCaptainProblem(user, ownTeam) === null;
  const isCaptain = isCaptainOf(user, ownTeam);
  // "Nochmal gegen dieses Team" for the captain of a team that is not banned (SPEC N-26), like
  // "Direkt anfragen" on the teams list; a missing verification the form names.
  const mayRequest = captainProblem(user, ownTeam) === null;
  const items = scrims.map((scrim) => {
    const opponent = scrim.hostTeamId === ownTeam.id ? scrim.guestTeam : scrim.hostTeam;
    const feedbackGiven = scrim.feedback.some((feedback) => feedback.teamId === ownTeam.id);
    return {
      id: scrim.id,
      startsAt: scrim.startsAt,
      format: scrim.format,
      maps: scrim.maps,
      status: scrim.status,
      rankMin: scrim.request.rankMin,
      rankMax: scrim.request.rankMax,
      /** From a direct request: no rank range to show (SPEC N-26). */
      direct: scrim.request.targetTeamId !== null,
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
      /** "Nochmal gegen dieses Team" for the captain, while the opponent is active (SPEC N-26). */
      rematch: mayRequest && isTeamActive(opponent) && !isUpcomingScrim(scrim, input.now),
      /** Unread messages of the opponent in the scrim's thread (SPEC N-28). */
      unread: unread.has(
        conversationKeyOf({ requestId: scrim.requestId, guestTeamId: scrim.guestTeamId }),
      ),
    };
  });
  const isUpcoming = (item: (typeof items)[number]) => isUpcomingScrim(item, input.now);
  const upcoming = items.filter(isUpcoming);
  // The opponent captain's Discord ID, for the "write on Discord" link (SPEC P0-6).
  const captainDiscordIds = await Promise.all(
    upcoming.map((item) => getDiscordId(item.opponent.captainId)),
  );
  // Running series with a date still to post (SPEC N-25). A due date waits for the reason the
  // sweeper sees: requestPostingProblems for the current captain (§5.27); for a fixed partnership
  // an unverified captain on either side (§5.28).
  // Sorted by the date shown: the stored pointer may still name a date already too late.
  const series = runningSeries
    .flatMap((entry) => {
      const nextStartsAt = nextSeriesStart(entry, input.now);
      return nextStartsAt ? [{ entry, nextStartsAt, postsAt: seriesPostsAt(nextStartsAt) }] : [];
    })
    .sort((a, b) => a.nextStartsAt.getTime() - b.nextStartsAt.getTime());
  const [blocked] = series.some(
    ({ entry, postsAt }) => entry.targetTeamId === null && postsAt <= input.now,
  )
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
  // Only the captain can ever end a series, so other members do not see it (§7); a partnership
  // the captains of both teams (§5.28).
  const end: ActionOffer = isCaptain
    ? { problem: actingCaptainProblem(user, ownTeam)?.text ?? null }
    : null;
  const seriesBlock = (entry: (typeof runningSeries)[number]) => {
    if (!entry.targetTeam) return blocked?.kind ?? null;
    const unverified = unverifiedCaptainTeams([entry.team, entry.targetTeam]);
    if (unverified.includes(ownTeam.id)) return "CAPTAIN_NOT_VERIFIED" as const;
    return unverified.length > 0 ? ("PARTNER_CAPTAIN_NOT_VERIFIED" as const) : null;
  };
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
      /** A direct request: the team asked (SPEC N-26). */
      target: request.targetTeam ? smallTeam(request.targetTeam) : null,
      /** The last date of a proposed fixed partnership, or null. */
      weeklyUntil: request.weeklyLastStartsAt,
      /** For a start time in the target's window "Heute spielbereit" (SPEC N-27). */
      readyWindow: request.readyWindowId !== null,
      /** Unread messages in any thread of the request (SPEC N-28). */
      unread: unreadRequestIds.has(request.id),
    })),
    incoming: incoming.map((request) => ({
      id: request.id,
      startsAt: request.startsAt,
      format: request.format,
      maps: request.maps,
      weeklyUntil: request.weeklyLastStartsAt,
      readyWindow: request.readyWindowId !== null,
      team: smallTeam(request.team),
      unread: unreadAsGuest(request.id),
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
      /** The request is due: it appears with the next sweeper run, unless it is blocked. */
      due: postsAt <= input.now,
      /**
       * Why the due request waits (limit, unverified captain; for a partnership an unverified
       * captain of the own or the partner team); null if it is not due yet.
       */
      blocked: postsAt <= input.now ? seriesBlock(entry) : null,
      /** A fixed partnership: the other team; its dates are booked, not posted (SPEC N-26). */
      partner: entry.targetTeam
        ? smallTeam(entry.teamId === ownTeam.id ? entry.targetTeam : entry.team)
        : null,
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
      unread: unreadAsGuest(application.request.id),
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
    /** The teams the one-time question about the landing page asks about (SPEC N-34). */
    showcaseQuestion: showcaseQuestionTeams(user, own),
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
  /** Only teams in these Uniliga leagues (SPEC N-36); missing or empty = all, unknown ones dropped. */
  leagues?: readonly number[] | null;
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
  /** The user may open a direct request to this team (SPEC N-26). */
  canRequest: boolean;
  /** The linked OPL team (SPEC N-35), or null. */
  oplUrl: string | null;
  /** Uniliga league of a linked team in the current season's group stage (SPEC N-36). */
  league: League | null;
};

const teamListSelect = {
  id: true,
  name: true,
  tag: true,
  captainId: true,
  oplTeamId: true,
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
  const user = await requireUser(input.userId);
  // "Direkt anfragen" for the captain of the active team, not banned, on every other card (SPEC
  // N-26); a missing verification the form names (getRequestForm).
  const ownTeam = await findOwnTeam(user.id);
  const requestingTeamId = ownTeam && captainProblem(user, ownTeam) === null ? ownTeam.id : null;
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

  const [rows, uniliga] = await Promise.all([
    prisma.team.findMany({ where: listedTeamWhere(), select: teamListSelect }),
    getUniligaLeagues("all"),
  ]);
  const leagues = chosenLeagues(input.leagues, uniliga.options);
  const candidates = rows
    .map((team) => ({
      team,
      rank: teamRank(team.members),
      fullyVerified: hasFullyVerifiedMembers(team.members),
    }))
    .filter(({ rank }) => ranks.length === 0 || (rank !== null && ranks.includes(rank)))
    .filter(({ fullyVerified }) => !fullyVerifiedOnly || fullyVerified)
    .filter(({ team }) => inChosenLeagues(leagues, uniliga, team.oplTeamId))
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
      canRequest: requestingTeamId !== null && team.id !== requestingTeamId,
      oplUrl: team.oplTeamId === null ? null : oplTeamUrl(team.oplTeamId),
      league: leagueOf(uniliga, team.oplTeamId),
    }));
  return {
    teams,
    filter: { search, ranks, fullyVerifiedOnly, reliableOnly, leagues },
    /** The leagues of the current Uniliga season for the filter; empty without one (SPEC N-36). */
    leagueOptions: uniliga.options,
  };
}

export type LandingShowcaseTeam = {
  id: string;
  name: string;
  tag: string;
  logo: TeamLogoInfo | null;
  universities: { shown: string[]; more: number };
  rank: Rank | null;
  /** Of the last RELIABILITY_WINDOW_DAYS, like on the board (SPEC N-23). */
  reliability: Reliability;
};

export type LandingShowcase = {
  teams: LandingShowcaseTeam[];
  /** Active teams beyond the shown ones, hidden or without consent included; a bare count (N-37). */
  others: number;
};

/**
 * The teams on the landing page (SPEC N-34, §5.36), for everyone without login: teams by
 * showcaseTeamWhere, with a logo first, then by scrims played in the last RELIABILITY_WINDOW_DAYS,
 * then by name; at most LANDING_SHOWCASE_MAX. The members are loaded only for team rank and
 * universities; no names leave this function. Since Phase 41 also the number of all other active
 * teams (SPEC N-37); count and list are two reads, so it never goes below 0.
 */
export async function getLandingShowcase(now: Date): Promise<LandingShowcase> {
  const [rows, active] = await Promise.all([
    loadShowcaseRows(),
    prisma.team.count({ where: activeTeamWhere() }),
  ]);
  const reliabilities = await getReliabilities(
    rows.map((team) => team.id),
    now,
  );
  const teams = rows
    .map((team) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      logo: teamLogoInfo(team),
      universities: teamUniversities(team.members),
      rank: teamRank(team.members),
      reliability: reliabilities.get(team.id)!,
    }))
    .sort(
      (a, b) =>
        Number(b.logo !== null) - Number(a.logo !== null) ||
        b.reliability.played - a.reliability.played ||
        a.name.localeCompare(b.name, "de"),
    )
    .slice(0, LANDING_SHOWCASE_MAX);
  return { teams, others: Math.max(0, active - teams.length) };
}

/** The consenting teams with what the cards need; members only for rank and universities. */
function loadShowcaseRows() {
  return prisma.team.findMany({
    where: showcaseTeamWhere(),
    select: {
      id: true,
      name: true,
      tag: true,
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
    },
  });
}
