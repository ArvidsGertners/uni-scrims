import { AppStatus, FeedbackOutcome, Rank, ScrimStatus, prisma } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  applyToRequest,
  cancelScrim,
  confirmApplication,
  getBoard,
  getMyScrims,
  getRequestDetail,
  getReliability,
  getScrimDetail,
  retireTeamActivity,
  submitFeedback,
  transferCaptain,
  withdrawApplication,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_INPUT,
  REQUEST_STARTS_AT,
  SOON,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createUser,
} from "./helpers.ts";

const HOUR = 60 * 60 * 1000;
const AFTER_START = new Date(REQUEST_STARTS_AT.getTime() + HOUR);
type ReadyTeam = Awaited<ReturnType<typeof createReadyTeam>>;

async function book(
  host: ReadyTeam,
  guest: ReadyTeam,
  overrides: Partial<typeof REQUEST_INPUT> = {},
) {
  const request = await createOpenRequest(host.captain.id, overrides);
  const { application } = await applyToRequest({
    userId: guest.captain.id,
    requestId: request.id,
    now: NOW,
  });
  return confirmApplication({
    userId: host.captain.id,
    requestId: request.id,
    applicationId: application.id,
    now: NOW,
  });
}

async function answer(
  team: ReadyTeam,
  scrimId: string,
  outcome: FeedbackOutcome,
  rating: number | null = null,
) {
  await submitFeedback({ userId: team.captain.id, scrimId, outcome, rating, now: AFTER_START });
}

describe("getReliability (§5.7)", () => {
  it("counts played scrims, no-shows and late cancellations and averages ratings from 3 on", async () => {
    const team = await createReadyTeam();
    const opponents = [await createReadyTeam(), await createReadyTeam(), await createReadyTeam()];
    for (const [index, opponent] of opponents.entries()) {
      const scrim = await book(team, opponent);
      await answer(team, scrim.id, FeedbackOutcome.PLAYED, 1);
      await answer(opponent, scrim.id, FeedbackOutcome.PLAYED, 5 - index);
    }
    const noShow = await book(team, opponents[0]!);
    await answer(team, noShow.id, FeedbackOutcome.WE_COULD_NOT);
    await answer(opponents[0]!, noShow.id, FeedbackOutcome.OPPONENT_NO_SHOW);
    const late = await book(team, opponents[1]!, SOON);
    await cancelScrim({ userId: team.captain.id, scrimId: late.id, now: NOW });
    const early = await book(team, opponents[1]!);
    await cancelScrim({ userId: team.captain.id, scrimId: early.id, now: NOW });
    const lateByOpponent = await book(team, opponents[2]!, SOON);
    await cancelScrim({ userId: opponents[2]!.captain.id, scrimId: lateByOpponent.id, now: NOW });
    const retired = await book(team, opponents[2]!, SOON);
    expect(retired.status).toBe(ScrimStatus.SCHEDULED);
    await retireTeamActivity(team.team.id, NOW);

    expect(await getReliability(team.team.id)).toEqual({
      played: 3,
      noShows: 1,
      lateCancels: 1,
      avgRating: 4,
    });
    // One rating is not enough for an average.
    expect(await getReliability(opponents[0]!.team.id)).toEqual({
      played: 1,
      noShows: 0,
      lateCancels: 0,
      avgRating: null,
    });
    expect((await getReliability(opponents[2]!.team.id)).lateCancels).toBe(1);
  });
});

describe("getBoard", () => {
  it("shows open future requests matching the own rank by default", async () => {
    const viewer = await createReadyTeam({ rank: Rank.GOLD });
    const author = await createReadyTeam();
    const matching = await createOpenRequest(author.captain.id);
    const higher = await createOpenRequest(author.captain.id, {
      rankMin: Rank.DIAMOND,
      rankMax: Rank.IMMORTAL,
    });
    const ids = (board: Awaited<ReturnType<typeof getBoard>>) =>
      board.requests.map((request) => request.id);

    const board = await getBoard({ userId: viewer.captain.id, now: NOW });
    expect(board.filter.rank).toBe(Rank.GOLD);
    expect(ids(board)).toContain(matching.id);
    expect(ids(board)).not.toContain(higher.id);
    expect(ids(await getBoard({ userId: viewer.captain.id, rank: "ALL", now: NOW }))).toEqual(
      expect.arrayContaining([matching.id, higher.id]),
    );
    const diamond = await getBoard({ userId: viewer.captain.id, rank: Rank.DIAMOND, now: NOW });
    expect(ids(diamond)).toContain(higher.id);
    expect(ids(diamond)).not.toContain(matching.id);
    // Started requests are no longer on the board.
    expect(
      ids(await getBoard({ userId: viewer.captain.id, now: REQUEST_STARTS_AT })),
    ).not.toContain(matching.id);
  });

  it("filters by the Berlin calendar date of the start", async () => {
    const viewer = await createReadyTeam();
    const author = await createReadyTeam();
    const night = await createOpenRequest(author.captain.id, { date: "2026-10-23", time: "01:00" });
    const board = (date: string) =>
      getBoard({ userId: viewer.captain.id, date, rank: "ALL", now: NOW });
    expect((await board("2026-10-23")).requests.map((r) => r.id)).toContain(night.id);
    expect((await board("2026-10-22")).requests.map((r) => r.id)).not.toContain(night.id);
    expect((await board("kaputt")).filter.date).toBeNull();
  });

  it("shows card data, the own application and own requests separately", async () => {
    const viewer = await createReadyTeam();
    const author = await createReadyTeam();
    const request = await createOpenRequest(author.captain.id);
    const own = await createOpenRequest(viewer.captain.id);
    const { application } = await applyToRequest({
      userId: viewer.captain.id,
      requestId: request.id,
      now: NOW,
    });
    const withdrawn = await createReadyTeam();
    const { application: withdrawnApplication } = await applyToRequest({
      userId: withdrawn.captain.id,
      requestId: request.id,
      now: NOW,
    });
    await withdrawApplication({
      userId: withdrawn.captain.id,
      applicationId: withdrawnApplication.id,
      now: NOW,
    });

    const board = await getBoard({ userId: viewer.members[0]!.id, rank: "ALL", now: NOW });
    expect(board.ownTeam).toMatchObject({ id: viewer.team.id, isCaptain: false });
    expect(board.requests.find((r) => r.id === request.id)).toMatchObject({
      applicationCount: 1,
      ownApplicationStatus: AppStatus.PENDING,
      team: {
        id: author.team.id,
        name: author.team.name,
        universities: { shown: [], more: 0 },
        reliability: { played: 0, noShows: 0, lateCancels: 0, avgRating: null },
      },
    });
    expect(board.requests.map((r) => r.id)).not.toContain(own.id);
    expect(board.ownRequests.map((r) => r.id)).toEqual([own.id]);
    expect(application.status).toBe(AppStatus.PENDING);
  });

  it("hides requests of banned teams and rejects banned users", async () => {
    const viewer = await createReadyTeam();
    const author = await createReadyTeam();
    const request = await createOpenRequest(author.captain.id);
    await prisma.team.update({ where: { id: author.team.id }, data: { bannedAt: NOW } });
    const board = await getBoard({ userId: viewer.captain.id, rank: "ALL", now: NOW });
    expect(board.requests.map((r) => r.id)).not.toContain(request.id);
    const banned = await createUser({ banned: true });
    await expect(getBoard({ userId: banned.id, now: NOW })).rejects.toMatchObject({
      code: "BANNED",
    });
  });
});

describe("getRequestDetail", () => {
  it("shows applications only to the creating team (§7)", async () => {
    const author = await createReadyTeam();
    const applicant = await createReadyTeam({ rank: Rank.IRON });
    const outsider = await createUser();
    const request = await createOpenRequest(author.captain.id);
    const { application } = await applyToRequest({
      userId: applicant.captain.id,
      requestId: request.id,
      message: "Hallo",
      now: NOW,
    });
    const detail = (userId: string) =>
      getRequestDetail({ userId, requestId: request.id, now: NOW });

    expect(await detail(outsider.id)).toMatchObject({
      open: true,
      hasTeam: false,
      isOwner: false,
      applications: null,
      ownApplication: null,
    });
    expect(await detail(author.members[0]!.id)).toMatchObject({
      isOwner: true,
      isCaptain: false,
      applications: [
        {
          id: application.id,
          message: "Hallo",
          outOfRange: true,
          team: { id: applicant.team.id, rank: Rank.IRON },
        },
      ],
    });
    expect(await detail(applicant.captain.id)).toMatchObject({
      isOwner: false,
      isCaptain: true,
      outOfRange: true,
      applications: null,
      ownApplication: { id: application.id, status: AppStatus.PENDING },
    });
  });

  it("links the scrim for both teams after booking and hides banned teams' requests", async () => {
    const { host, guest, request, scrim } = await bookScrim();
    const outsider = await createReadyTeam();
    const detail = (userId: string) =>
      getRequestDetail({ userId, requestId: request.id, now: NOW });
    expect(await detail(host.members[0]!.id)).toMatchObject({ open: false, scrimId: scrim.id });
    expect(await detail(guest.members[0]!.id)).toMatchObject({ scrimId: scrim.id });
    expect(await detail(outsider.captain.id)).toMatchObject({ scrimId: null });
    await prisma.team.update({ where: { id: host.team.id }, data: { bannedAt: NOW } });
    expect(await detail(outsider.captain.id)).toBeNull();
  });
});

describe("getScrimDetail and getMyScrims", () => {
  it("is only visible to members of both teams and shows the current opponent captain", async () => {
    const { host, guest, scrim } = await bookScrim();
    const outsider = await createReadyTeam();
    const detail = (userId: string, now = NOW) =>
      getScrimDetail({ userId, scrimId: scrim.id, now });

    expect(await detail(outsider.captain.id)).toBeNull();
    expect(await detail(guest.members[0]!.id)).toMatchObject({
      isHost: false,
      isCaptain: false,
      opponent: { id: host.team.id, captainName: host.captain.name },
      canCancel: false,
      canGiveFeedback: false,
    });
    await transferCaptain({
      userId: host.captain.id,
      teamId: host.team.id,
      newCaptainId: host.members[1]!.id,
    });
    expect(await detail(guest.captain.id)).toMatchObject({
      opponent: { captainName: host.members[1]!.name },
      canCancel: true,
      cancelWouldBeLate: false,
      feedbackNotYetOpen: true,
    });
    expect(await detail(guest.captain.id, AFTER_START)).toMatchObject({
      canCancel: false,
      canGiveFeedback: true,
      feedbackNotYetOpen: false,
    });
    await submitFeedback({
      userId: guest.captain.id,
      scrimId: scrim.id,
      outcome: FeedbackOutcome.PLAYED,
      rating: 5,
      now: AFTER_START,
    });
    expect(await detail(guest.captain.id, AFTER_START)).toMatchObject({
      status: ScrimStatus.AWAITING_FEEDBACK,
      canGiveFeedback: false,
      ownFeedback: { outcome: FeedbackOutcome.PLAYED, rating: 5 },
    });
  });

  it("lists upcoming and past scrims of the own team", async () => {
    const team = await createReadyTeam();
    const opponent = await createReadyTeam();
    const soon = await book(team, opponent, SOON);
    const later = await book(opponent, team);
    const cancelled = await book(team, opponent);
    await cancelScrim({ userId: team.captain.id, scrimId: cancelled.id, now: NOW });

    const mine = await getMyScrims({ userId: team.members[0]!.id, now: NOW });
    expect(mine.upcoming.map((s) => s.id)).toEqual([soon.id, later.id]);
    expect(mine.upcoming[1]).toMatchObject({ opponent: { name: opponent.team.name } });
    expect(mine.past.map((s) => s.id)).toEqual([cancelled.id]);

    const afterSoon = await getMyScrims({ userId: team.captain.id, now: AFTER_START });
    expect(afterSoon.upcoming).toEqual([]);
    expect(afterSoon.past.map((s) => s.id)).toEqual(
      expect.arrayContaining([soon.id, later.id, cancelled.id]),
    );
    expect(await getMyScrims({ userId: (await createUser()).id, now: NOW })).toEqual({
      hasTeam: false,
      upcoming: [],
      past: [],
    });
  });
});
