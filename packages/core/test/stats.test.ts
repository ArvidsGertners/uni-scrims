// The success metrics count everything in the database, so every test here starts from empty
// domain tables, and the file leaves them empty. Test files run one after another
// (vitest.config.ts) and create their own data.
import {
  FeedbackOutcome,
  MemberRole,
  RequestStatus,
  ScrimFormat,
  ScrimStatus,
  VerifStatus,
  prisma,
  Rank,
} from "@uni-scrims/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  type MetricKey,
  STATS_WINDOW_DAYS,
  SUCCESS_METRICS,
  type SuccessMetric,
  getSuccessMetrics,
  median,
} from "../src/index.ts";
import { createTeamWithMembers, createUser, useAdmin } from "./helpers.ts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-11-30T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const WINDOW_START = ago(STATS_WINDOW_DAYS * DAY);

const admin = useAdmin();

async function clearDomainTables() {
  await prisma.notification.deleteMany();
  await prisma.scrimFeedback.deleteMany();
  await prisma.scrim.deleteMany();
  await prisma.application.deleteMany();
  await prisma.scrimRequest.deleteMany();
  await prisma.requestSeries.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.teamLogo.deleteMany();
  await prisma.team.deleteMany();
  await prisma.verificationRequest.deleteMany();
}

beforeEach(clearDomainTables);

afterAll(async () => {
  await clearDomainTables();
  await prisma.$disconnect();
});

type Team = Awaited<ReturnType<typeof createTeamWithMembers>>;

async function createRequest(team: Team, status: RequestStatus, startsAt: Date, createdAt: Date) {
  return prisma.scrimRequest.create({
    data: {
      teamId: team.team.id,
      createdById: team.captain.id,
      startsAt,
      format: ScrimFormat.ONE_MAP,
      rankMin: Rank.IRON,
      rankMax: Rank.RADIANT,
      maps: [],
      status,
      createdAt,
    },
  });
}

/** A booked scrim; `bookedAfter` is the time from creating the request to the booking. */
async function createScrim(input: {
  host: Team;
  guest: Team;
  status: ScrimStatus;
  startsAt: Date;
  requestCreatedAt: Date;
  bookedAfter: number;
  feedback?: { team: Team; outcome: FeedbackOutcome; rating?: number }[];
}) {
  const request = await createRequest(
    input.host,
    RequestStatus.BOOKED,
    input.startsAt,
    input.requestCreatedAt,
  );
  const scrim = await prisma.scrim.create({
    data: {
      requestId: request.id,
      hostTeamId: input.host.team.id,
      guestTeamId: input.guest.team.id,
      startsAt: input.startsAt,
      format: ScrimFormat.ONE_MAP,
      maps: [],
      feedbackOpensAt: new Date(input.startsAt.getTime() + 3 * HOUR),
      feedbackDeadline: new Date(input.startsAt.getTime() + 75 * HOUR),
      status: input.status,
      createdAt: new Date(input.requestCreatedAt.getTime() + input.bookedAfter),
    },
  });
  for (const answer of input.feedback ?? []) {
    await prisma.scrimFeedback.create({
      data: {
        scrimId: scrim.id,
        teamId: answer.team.team.id,
        submittedById: answer.team.captain.id,
        outcome: answer.outcome,
        rating: answer.rating ?? null,
        createdAt: input.startsAt,
      },
    });
  }
}

async function createDecision(createdAt: Date, takes: number, decidedById: string | null) {
  const user = await createUser();
  await prisma.verificationRequest.create({
    data: {
      userId: user.id,
      mimeType: "application/pdf",
      sizeBytes: 1,
      status: VerifStatus.APPROVED,
      createdAt,
      decidedAt: new Date(createdAt.getTime() + takes),
      decidedById,
    },
  });
}

function byKey(metrics: SuccessMetric[]) {
  return Object.fromEntries(metrics.map((metric) => [metric.key, metric])) as Record<
    MetricKey,
    SuccessMetric
  >;
}

async function metricsAt(now = NOW) {
  const metrics = byKey(await getSuccessMetrics({ adminId: admin.id, now }));
  const windows = (key: MetricKey) => {
    const metric = metrics[key];
    if (metric.snapshot) throw new Error(`${key} is a snapshot`);
    return [metric.last28Days, metric.total];
  };
  return { metrics, windows };
}

describe("median", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([10, 2, 30, 1])).toBe(6);
  });
});

describe("getSuccessMetrics", () => {
  it("is for admins only", async () => {
    const user = await createUser({ verified: true });
    await expect(getSuccessMetrics({ adminId: user.id, now: NOW })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("has no values without data, except the team counts", async () => {
    const metrics = byKey(await getSuccessMetrics({ adminId: admin.id, now: NOW }));
    expect(metrics.verifiedCaptainTeams).toMatchObject({
      snapshot: true,
      now: { value: 0, cases: 0, reached: false, stretchReached: false },
    });
    // For information only: no target, so never reached or missed (SPEC N-21).
    expect(metrics.fullyVerifiedTeams).toMatchObject({
      snapshot: true,
      target: null,
      now: { value: 0, cases: 0, reached: null, stretchReached: null },
    });
    expect(metrics.activeTeams).toMatchObject({
      now: { value: null, cases: 0, reached: null, stretchReached: null },
    });
    for (const { key, snapshot } of SUCCESS_METRICS) {
      if (snapshot) continue;
      expect(metrics[key]).toMatchObject({
        last28Days: { value: null, cases: 0, reached: null, stretchReached: null },
        total: { value: null, cases: 0, reached: null, stretchReached: null },
      });
    }
  });

  it("computes every metric of SPEC §8 for the last 28 days and in total", async () => {
    const a = await createTeamWithMembers({ extraMembers: 4 });
    const b = await createTeamWithMembers({ extraMembers: 4 });
    // F: fully verified, but no scrims.
    await createTeamWithMembers({ extraMembers: 4 });
    const c = await createTeamWithMembers({ extraMembers: 3 });
    // A verified coach as fifth member: not fully verified (SPEC N-1).
    const e = await createTeamWithMembers({ extraMembers: 4 });
    await prisma.teamMember.updateMany({
      where: { userId: e.members[0]!.id },
      data: { role: MemberRole.COACH },
    });
    // Banned teams are not active and count nowhere as teams.
    await createTeamWithMembers({ extraMembers: 4, banned: true });

    const played = FeedbackOutcome.PLAYED;
    // In the last 28 days.
    await createScrim({
      host: a,
      guest: b,
      status: ScrimStatus.COMPLETED,
      startsAt: ago(2 * DAY),
      requestCreatedAt: ago(10 * DAY),
      bookedAfter: 2 * HOUR,
      feedback: [
        { team: a, outcome: played, rating: 4 },
        { team: b, outcome: played, rating: 5 },
      ],
    });
    await createScrim({
      host: a,
      guest: b,
      status: ScrimStatus.COMPLETED,
      startsAt: ago(5 * DAY),
      requestCreatedAt: ago(12 * DAY),
      bookedAfter: 10 * HOUR,
      feedback: [{ team: a, outcome: played, rating: 3 }],
    });
    await createScrim({
      host: a,
      guest: c,
      status: ScrimStatus.NO_SHOW,
      startsAt: ago(6 * DAY),
      requestCreatedAt: ago(8 * DAY),
      bookedAfter: 4 * HOUR,
      feedback: [{ team: a, outcome: FeedbackOutcome.OPPONENT_NO_SHOW }],
    });
    await createScrim({
      host: b,
      guest: c,
      status: ScrimStatus.UNCONFIRMED,
      startsAt: ago(7 * DAY),
      requestCreatedAt: ago(9 * DAY),
      bookedAfter: 30 * HOUR,
    });
    await createScrim({
      host: a,
      guest: c,
      status: ScrimStatus.CANCELLED,
      startsAt: ago(3 * DAY),
      requestCreatedAt: ago(4 * DAY),
      bookedAfter: HOUR,
    });
    // A dispute counts as evaluated, but its rating does not (only played scrims).
    await createScrim({
      host: a,
      guest: b,
      status: ScrimStatus.DISPUTED,
      startsAt: ago(4 * DAY),
      requestCreatedAt: ago(6 * DAY),
      bookedAfter: 12 * HOUR,
      feedback: [
        { team: a, outcome: played, rating: 5 },
        { team: b, outcome: FeedbackOutcome.OPPONENT_NO_SHOW },
      ],
    });
    // Booked in the window, starts in the future: only the time to booking counts.
    await createScrim({
      host: a,
      guest: b,
      status: ScrimStatus.SCHEDULED,
      startsAt: new Date(NOW.getTime() + 2 * DAY),
      requestCreatedAt: ago(DAY),
      bookedAfter: 6 * HOUR,
    });
    // Older: day 29 still counts for "≥ 2 scrims per month" (30 days), day 60 nowhere but in total.
    await createScrim({
      host: a,
      guest: b,
      status: ScrimStatus.COMPLETED,
      startsAt: ago(29 * DAY),
      requestCreatedAt: ago(40 * DAY),
      bookedAfter: HOUR,
      feedback: [
        { team: a, outcome: played, rating: 2 },
        { team: b, outcome: played, rating: 2 },
      ],
    });
    await createScrim({
      host: b,
      guest: c,
      status: ScrimStatus.COMPLETED,
      startsAt: ago(60 * DAY),
      requestCreatedAt: ago(70 * DAY),
      bookedAfter: HOUR / 2,
    });

    // Requests without a scrim: expired ones count, and so does one still open after its start
    // (the sweeper has not expired it yet). Deleted ones and future open ones do not.
    await createRequest(a, RequestStatus.EXPIRED, ago(20 * DAY), ago(21 * DAY));
    await createRequest(a, RequestStatus.EXPIRED, ago(50 * DAY), ago(51 * DAY));
    await createRequest(b, RequestStatus.OPEN, ago(DAY), ago(2 * DAY));
    await createRequest(a, RequestStatus.CANCELLED, ago(2 * DAY), ago(3 * DAY));
    await createRequest(b, RequestStatus.OPEN, new Date(NOW.getTime() + DAY), ago(DAY));

    // Verifications decided by hand count. Automatic and ban rejections (no decidedById) do not,
    // nor do decisions after now.
    await createDecision(ago(3 * DAY), 2 * HOUR, admin.id);
    await createDecision(ago(5 * DAY), 10 * HOUR, admin.id);
    await createDecision(ago(10 * DAY), 30 * HOUR, admin.id);
    await createDecision(ago(40 * DAY), HOUR, admin.id);
    await createDecision(ago(2 * DAY), HOUR, null);
    await createDecision(ago(HOUR), 2 * HOUR, admin.id);

    const { metrics, windows } = await metricsAt();

    // All five active teams have a verified captain (SPEC N-21); A, B and F are fully verified,
    // C misses a player, E has a coach as fifth; the banned team is out.
    expect(metrics.verifiedCaptainTeams).toMatchObject({
      now: { value: 5, cases: 5, reached: false, stretchReached: false },
    });
    expect(metrics.fullyVerifiedTeams).toMatchObject({
      now: { value: 3, cases: 5, reached: null, stretchReached: null },
    });
    // A and B played 3 scrims in the last 30 days; C, E and F did not.
    expect(metrics.activeTeams).toMatchObject({
      now: { value: 2 / 5, cases: 5, reached: false, stretchReached: null },
    });

    // Decisions: 2 h, 10 h, 30 h in the window; 1 h before it.
    expect(windows("reviewTime")).toMatchObject([
      { value: 10 * HOUR, cases: 3, reached: true, stretchReached: false },
      // Mean of 2 h and 10 h; 6 h is not below the stretch goal of 6 h.
      { value: 6 * HOUR, cases: 4, reached: true, stretchReached: false },
    ]);
    // Booked with a start up to now: 6 in the window, 8 in total; expired or overdue: 2 and 3.
    expect(windows("confirmationRate")).toMatchObject([
      { value: 0.75, cases: 8, reached: true, stretchReached: true },
      { value: 8 / 11, cases: 11, reached: true, stretchReached: true },
    ]);
    // Bookings in the window: 1, 2, 4, 6, 10, 12, 30 h; in total also 0.5 h and 1 h.
    expect(windows("timeToBooking")).toMatchObject([
      { value: 6 * HOUR, cases: 7, reached: true, stretchReached: false },
      { value: 4 * HOUR, cases: 9, reached: true, stretchReached: true },
    ]);
    expect(windows("showUpRate")).toMatchObject([
      { value: 2 / 3, cases: 3, reached: false, stretchReached: false },
      { value: 0.8, cases: 5, reached: false, stretchReached: false },
    ]);
    expect(windows("noShowRate")).toMatchObject([
      { value: 1 / 3, cases: 3, reached: false, stretchReached: null },
      { value: 0.2, cases: 5, reached: false, stretchReached: null },
    ]);
    // Evaluated: played, no-show, unconfirmed and disputed ones; cancelled and scheduled are not.
    expect(windows("feedbackRate")).toMatchObject([
      { value: 0.8, cases: 5, reached: true, stretchReached: true },
      { value: 5 / 7, cases: 7, reached: true, stretchReached: false },
    ]);
    // Ratings of played scrims: 4, 5, 3 in the window; also 2, 2 in total.
    expect(windows("averageRating")).toMatchObject([
      { value: 4, cases: 3, reached: true, stretchReached: null },
      { value: 3.2, cases: 5, reached: false, stretchReached: null },
    ]);
  });

  it("counts teams with 2 played scrims that started in the last 30 days", async () => {
    const opponent = await createTeamWithMembers({ extraMembers: 3, verifiedCaptain: false });
    const scrim = (host: Team, status: ScrimStatus, startsAt: Date) =>
      createScrim({
        host,
        guest: opponent,
        status,
        startsAt,
        requestCreatedAt: new Date(startsAt.getTime() - DAY),
        bookedAfter: HOUR,
      });
    // The second scrim exactly 30 days ago still counts, 1 ms earlier it does not.
    const inside = await createTeamWithMembers({ extraMembers: 4 });
    await scrim(inside, ScrimStatus.COMPLETED, ago(2 * DAY));
    await scrim(inside, ScrimStatus.COMPLETED, ago(30 * DAY));
    const outside = await createTeamWithMembers({ extraMembers: 4 });
    await scrim(outside, ScrimStatus.COMPLETED, ago(2 * DAY));
    await scrim(outside, ScrimStatus.COMPLETED, new Date(ago(30 * DAY).getTime() - 1));
    // Only played scrims count, not a no-show.
    const noShow = await createTeamWithMembers({ extraMembers: 4 });
    await scrim(noShow, ScrimStatus.COMPLETED, ago(2 * DAY));
    await scrim(noShow, ScrimStatus.NO_SHOW, ago(3 * DAY));

    // The opponent played all of them but has no verified captain, so it is in neither number.
    const { metrics } = await metricsAt();
    expect(metrics.verifiedCaptainTeams).toMatchObject({ now: { value: 3, cases: 4 } });
    // Its 3 verified players do not make it fully verified either.
    expect(metrics.fullyVerifiedTeams).toMatchObject({ now: { value: 3, cases: 4 } });
    expect(metrics.activeTeams).toMatchObject({
      now: { value: 1 / 3, cases: 3, reached: false, stretchReached: null },
    });
  });

  it("puts entries exactly at the window start and at now into the last 28 days", async () => {
    const a = await createTeamWithMembers({ extraMembers: 4 });
    const b = await createTeamWithMembers({ extraMembers: 4 });
    const justBefore = new Date(WINDOW_START.getTime() - 1);
    // Start, booking and the decision each at now, at the window start, and 1 ms before it.
    for (const at of [NOW, WINDOW_START, justBefore]) {
      await createScrim({
        host: a,
        guest: b,
        status: ScrimStatus.COMPLETED,
        startsAt: at,
        requestCreatedAt: new Date(at.getTime() - 2 * HOUR),
        bookedAfter: 2 * HOUR,
      });
      await createDecision(new Date(at.getTime() - HOUR), HOUR, admin.id);
    }

    const { windows } = await metricsAt();
    for (const key of ["reviewTime", "confirmationRate", "timeToBooking", "showUpRate"] as const) {
      expect(windows(key).map(({ cases }) => cases)).toEqual([2, 3]);
    }
  });
});
