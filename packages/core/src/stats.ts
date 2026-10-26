// Success metrics of SPEC §8 for the admin statistics page (SPEC N-2). Read only, nothing is stored:
// the data is small (ARCHITECTURE §1), so medians and rates are computed here from plain reads.
import { RequestStatus, ScrimStatus, prisma } from "@uni-scrims/db";
import { requireAdmin } from "./permissions.ts";
import { activeTeamWhere, hasFullyVerifiedMembers, isVerifiedMember } from "./readiness.ts";
import { OUTCOME_STATUSES } from "./scrims.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The "last 28 days" window (SPEC N-2); the other one is everything up to now. */
export const STATS_WINDOW_DAYS = 28;
/** "Teams mit ≥ 2 Scrims pro Monat": played scrims that started in the last 30 days. */
export const ACTIVE_TEAM_DAYS = 30;
export const ACTIVE_TEAM_MIN_SCRIMS = 2;

/** Snapshot metrics describe now; all others have a value per window. */
type SnapshotKey = "verifiedCaptainTeams" | "fullyVerifiedTeams" | "activeTeams";
type WindowedKey =
  | "reviewTime"
  | "confirmationRate"
  | "timeToBooking"
  | "showUpRate"
  | "feedbackRate"
  | "noShowRate"
  | "averageRating";
export type MetricKey = SnapshotKey | WindowedKey;

/** count: teams; duration: milliseconds; rate: 0–1; rating: 1–5. */
export type MetricUnit = "count" | "duration" | "rate" | "rating";

type MetricDefinition = {
  /** Early indicators (first 4 weeks) or late ones (after 2–3 months), as in SPEC §8. */
  group: "early" | "late";
  unit: MetricUnit;
  /** "atLeast": reached at value ≥ target; "below": reached at value < target. */
  goal: "atLeast" | "below";
  /** null: shown for information only, without target and stretch (SPEC N-21). */
  target: number | null;
  stretch: number | null;
} & ({ key: SnapshotKey; snapshot: true } | { key: WindowedKey; snapshot: false });

/** SPEC §8, in its order, with targets and stretch goals; names and definitions: i18n/stats.ts. */
export const SUCCESS_METRICS: readonly MetricDefinition[] = [
  {
    // Until Phase 24 "readyTeams", the teams with ≥ 5 verified players (SPEC N-21).
    key: "verifiedCaptainTeams",
    group: "early",
    unit: "count",
    goal: "atLeast",
    target: 15,
    stretch: 30,
    snapshot: true,
  },
  {
    key: "fullyVerifiedTeams",
    group: "early",
    unit: "count",
    goal: "atLeast",
    target: null,
    stretch: null,
    snapshot: true,
  },
  {
    key: "reviewTime",
    group: "early",
    unit: "duration",
    goal: "below",
    target: 24 * HOUR,
    stretch: 6 * HOUR,
    snapshot: false,
  },
  {
    key: "confirmationRate",
    group: "early",
    unit: "rate",
    goal: "atLeast",
    target: 0.5,
    stretch: 0.7,
    snapshot: false,
  },
  {
    key: "timeToBooking",
    group: "early",
    unit: "duration",
    goal: "below",
    target: 24 * HOUR,
    stretch: 6 * HOUR,
    snapshot: false,
  },
  {
    key: "showUpRate",
    group: "early",
    unit: "rate",
    goal: "atLeast",
    target: 0.9,
    stretch: 0.95,
    snapshot: false,
  },
  {
    key: "feedbackRate",
    group: "early",
    unit: "rate",
    goal: "atLeast",
    target: 0.6,
    stretch: 0.8,
    snapshot: false,
  },
  {
    key: "activeTeams",
    group: "late",
    unit: "rate",
    goal: "atLeast",
    target: 0.5,
    stretch: null,
    snapshot: true,
  },
  {
    key: "noShowRate",
    group: "late",
    unit: "rate",
    goal: "below",
    target: 0.1,
    stretch: null,
    snapshot: false,
  },
  {
    key: "averageRating",
    group: "late",
    unit: "rating",
    goal: "atLeast",
    target: 4,
    stretch: null,
    snapshot: false,
  },
];

export type MetricResult = {
  /** null without cases. */
  value: number | null;
  /** How many entries the value rests on (for the team counts: the active teams). */
  cases: number;
  /** null without a value or without a target, or for stretchReached without a stretch goal. */
  reached: boolean | null;
  stretchReached: boolean | null;
};

export type SuccessMetric = MetricDefinition &
  (
    | { snapshot: true; now: MetricResult }
    | { snapshot: false; last28Days: MetricResult; total: MetricResult }
  );

/** Median of the values, the mean of the two middle ones for an even count; null if empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function meets(value: number, goal: MetricDefinition["goal"], threshold: number): boolean {
  return goal === "atLeast" ? value >= threshold : value < threshold;
}

function result(definition: MetricDefinition, value: number | null, cases: number): MetricResult {
  return {
    value,
    cases,
    reached:
      value === null || definition.target === null
        ? null
        : meets(value, definition.goal, definition.target),
    stretchReached:
      value === null || definition.stretch === null
        ? null
        : meets(value, definition.goal, definition.stretch),
  };
}

/** part ÷ whole, null without cases. */
function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

type Value = [value: number | null, cases: number];

/**
 * The metrics of SPEC §8 for the last 28 days and in total, both up to `now` (SPEC N-2). Admins
 * only; the page shows sums, never names.
 */
export async function getSuccessMetrics(input: {
  adminId: string;
  now: Date;
}): Promise<SuccessMetric[]> {
  await requireAdmin(input.adminId);
  const { now } = input;
  const [teams, decisions, requests, scrims] = await Promise.all([
    prisma.team.findMany({
      where: activeTeamWhere(),
      select: {
        id: true,
        captain: { select: { verifiedAt: true } },
        members: { select: { role: true, user: { select: { verifiedAt: true } } } },
      },
    }),
    // Decided by hand: automatic and ban rejections have no decidedById.
    prisma.verificationRequest.findMany({
      where: { decidedById: { not: null }, decidedAt: { lte: now } },
      select: { createdAt: true, decidedAt: true },
    }),
    // Booked and expired requests that have started. One still OPEN after its start expires with
    // the sweeper's next run, so it counts as expired already; a sweeper that lags or stands still
    // would otherwise leave it out and inflate the rate. Deleted requests (CANCELLED) never count,
    // nor do direct requests: only board requests measure the board (SPEC §8, N-26).
    prisma.scrimRequest.findMany({
      where: {
        status: { in: [RequestStatus.BOOKED, RequestStatus.EXPIRED, RequestStatus.OPEN] },
        startsAt: { lte: now },
        targetTeamId: null,
      },
      select: { status: true, startsAt: true },
    }),
    prisma.scrim.findMany({
      where: { createdAt: { lte: now } },
      select: {
        status: true,
        startsAt: true,
        createdAt: true,
        hostTeamId: true,
        guestTeamId: true,
        request: { select: { createdAt: true, targetTeamId: true } },
        feedback: { where: { rating: { not: null } }, select: { rating: true } },
        _count: { select: { feedback: true } },
      },
    }),
  ]);

  // All rows are up to now already; a window only needs its start (null: in total).
  const within = (date: Date, from: Date | null) => !from || date >= from;
  const started = scrims.filter((scrim) => scrim.startsAt <= now);
  const statuses: readonly ScrimStatus[] = OUTCOME_STATUSES;

  const windowed = (from: Date | null): Record<WindowedKey, Value> => {
    const decided = decisions.filter((decision) => within(decision.decidedAt!, from));
    const requestsIn = requests.filter((request) => within(request.startsAt, from));
    const booked = requestsIn.filter((request) => request.status === RequestStatus.BOOKED).length;
    // Time to booking of board requests only: a partnership books its dates when they are created.
    const bookings = scrims.filter(
      (scrim) => within(scrim.createdAt, from) && scrim.request.targetTeamId === null,
    );
    const startedIn = started.filter((scrim) => within(scrim.startsAt, from));
    const played = startedIn.filter((scrim) => scrim.status === ScrimStatus.COMPLETED);
    const noShows = startedIn.filter((scrim) => scrim.status === ScrimStatus.NO_SHOW).length;
    const evaluated = startedIn.filter((scrim) => statuses.includes(scrim.status));
    const ratings = played.flatMap((scrim) => scrim.feedback.map(({ rating }) => rating!));
    const outcomes = played.length + noShows;
    return {
      reviewTime: [
        median(
          decided.map((decision) => decision.decidedAt!.getTime() - decision.createdAt.getTime()),
        ),
        decided.length,
      ],
      confirmationRate: [rate(booked, requestsIn.length), requestsIn.length],
      timeToBooking: [
        median(
          bookings.map((scrim) => scrim.createdAt.getTime() - scrim.request.createdAt.getTime()),
        ),
        bookings.length,
      ],
      showUpRate: [rate(played.length, outcomes), outcomes],
      feedbackRate: [
        rate(evaluated.filter((scrim) => scrim._count.feedback > 0).length, evaluated.length),
        evaluated.length,
      ],
      noShowRate: [rate(noShows, outcomes), outcomes],
      averageRating: [average(ratings), ratings.length],
    };
  };
  const last28Days = windowed(new Date(now.getTime() - STATS_WINDOW_DAYS * DAY));
  const total = windowed(null);

  // Teams that can play since Phase 25: their captain is verified (SPEC N-21).
  const captainTeamIds = teams.filter((team) => isVerifiedMember(team.captain)).map(({ id }) => id);
  const fullyVerifiedTeams = teams.filter((team) => hasFullyVerifiedMembers(team.members)).length;
  const activeStart = new Date(now.getTime() - ACTIVE_TEAM_DAYS * DAY);
  const playedPerTeam = new Map<string, number>();
  for (const scrim of started) {
    if (scrim.status !== ScrimStatus.COMPLETED || !within(scrim.startsAt, activeStart)) continue;
    for (const teamId of [scrim.hostTeamId, scrim.guestTeamId]) {
      playedPerTeam.set(teamId, (playedPerTeam.get(teamId) ?? 0) + 1);
    }
  }
  const activeTeams = captainTeamIds.filter(
    (teamId) => (playedPerTeam.get(teamId) ?? 0) >= ACTIVE_TEAM_MIN_SCRIMS,
  ).length;
  const snapshots: Record<SnapshotKey, Value> = {
    // Counts: no such teams is 0, not "no value", even without any active team.
    verifiedCaptainTeams: [captainTeamIds.length, teams.length],
    fullyVerifiedTeams: [fullyVerifiedTeams, teams.length],
    activeTeams: [rate(activeTeams, captainTeamIds.length), captainTeamIds.length],
  };

  return SUCCESS_METRICS.map((definition): SuccessMetric => {
    if (definition.snapshot) {
      const [value, cases] = snapshots[definition.key];
      return { ...definition, now: result(definition, value, cases) };
    }
    return {
      ...definition,
      last28Days: result(definition, ...last28Days[definition.key]),
      total: result(definition, ...total[definition.key]),
    };
  });
}
