import { AppStatus, FeedbackOutcome, MemberRole, Rank, ScrimStatus, prisma } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  MAX_OPEN_REQUESTS,
  applyToRequest,
  cancelScrim,
  confirmApplication,
  getBoard,
  getMyScrims,
  getRequestDetail,
  getRequestForm,
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

describe("getRequestForm", () => {
  const form = (userId: string, now = NOW) => getRequestForm({ userId, now });
  const BANNED = { kind: "TEAM_BANNED", message: "Das Team ist gesperrt." };
  const NOT_CAPTAIN = { kind: "NOT_CAPTAIN", message: "Das kann nur euer Captain." };
  const NOT_VERIFIED = {
    kind: "CAPTAIN_NOT_VERIFIED",
    message: "Als Captain musst du für Scrim-Aktionen verifiziert sein.",
  };
  const NOT_READY = {
    kind: "TEAM_NOT_READY",
    message: "Euer Team hat noch keine 5 verifizierten Spieler.",
  };
  const LIMIT = {
    kind: "REQUEST_LIMIT",
    message: `Ihr habt schon ${MAX_OPEN_REQUESTS} offene Anfragen. Löscht erst eine.`,
  };

  it("lists every reason for the captain; members only learn that the captain has to act", async () => {
    expect(await form((await createUser()).id)).toBeNull();
    // Unverified captain plus 4 verified members: also not ready.
    const team = await createReadyTeam({ verifiedCaptain: false });
    expect(await form(team.captain.id)).toEqual({
      rank: Rank.GOLD,
      problems: [NOT_VERIFIED, NOT_READY],
    });
    expect(await form(team.members[0]!.id)).toMatchObject({ problems: [NOT_CAPTAIN] });

    // A ban is final, so it is the only reason, for the captain and for members.
    await prisma.team.update({ where: { id: team.team.id }, data: { bannedAt: NOW } });
    expect(await form(team.captain.id)).toMatchObject({ problems: [BANNED] });
    expect(await form(team.members[0]!.id)).toMatchObject({ problems: [BANNED] });
    // createRequest rejects with the same reason (here already before the team lock).
    await expect(createOpenRequest(team.captain.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: BANNED.message,
    });
  });

  it("applies the limit of open requests like createRequest, next to other reasons", async () => {
    const team = await createReadyTeam();
    expect(await form(team.captain.id)).toMatchObject({ problems: [] });
    for (const time of ["11:00", "12:00", "13:00", "14:00", "15:00"]) {
      await createOpenRequest(team.captain.id, { date: "2026-10-22", time });
    }
    const sixth = () => createOpenRequest(team.captain.id, { date: "2026-10-22", time: "16:00" });
    expect(await form(team.captain.id)).toMatchObject({ problems: [LIMIT] });
    await expect(sixth()).rejects.toMatchObject({ code: "CONFLICT", message: LIMIT.message });

    // The captain passes the checks before the lock; under the lock createRequest throws the
    // first entry of the same list, so readiness wins over the limit.
    await prisma.user.update({ where: { id: team.members[0]!.id }, data: { verifiedAt: null } });
    expect(await form(team.captain.id)).toMatchObject({ problems: [NOT_READY, LIMIT] });
    await expect(sixth()).rejects.toMatchObject({ code: "FORBIDDEN", message: NOT_READY.message });
    // A request that has started no longer counts (11:00 Berlin = 09:00 UTC).
    expect(await form(team.captain.id, new Date("2026-10-22T09:00:00Z"))).toMatchObject({
      problems: [NOT_READY],
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
      apply: null,
      applyAs: null,
      withdraw: null,
      remove: null,
      confirm: null,
      applications: null,
      ownApplication: null,
    });
    const onlyCaptain = { problem: "Das kann nur euer Captain." };
    expect(await detail(author.members[0]!.id)).toMatchObject({
      apply: null,
      // Deleting is never offered to members, the captain rule shows once at confirming.
      remove: null,
      confirm: onlyCaptain,
      applications: [
        {
          id: application.id,
          message: "Hallo",
          outOfRange: true,
          team: { id: applicant.team.id, rank: Rank.IRON },
          canConfirm: false,
          teamProblem: null,
        },
      ],
    });
    expect(await detail(author.captain.id)).toMatchObject({
      remove: { problem: null },
      confirm: { problem: null },
      applications: [{ canConfirm: true, teamProblem: null }],
    });
    expect(await detail(applicant.captain.id)).toMatchObject({
      apply: null,
      withdraw: { problem: null },
      remove: null,
      confirm: null,
      outOfRange: true,
      applications: null,
      ownApplication: { id: application.id, status: AppStatus.PENDING },
    });
    expect(await detail(applicant.members[0]!.id)).toMatchObject({ withdraw: onlyCaptain });
  });

  it("offers applying and confirming only where core allows them", async () => {
    const author = await createReadyTeam();
    const applicant = await createReadyTeam();
    const request = await createOpenRequest(author.captain.id);
    const { application } = await applyToRequest({
      userId: applicant.captain.id,
      requestId: request.id,
      now: NOW,
    });
    const notReady = "Euer Team hat noch keine 5 verifizierten Spieler.";
    const detail = (userId: string) =>
      getRequestDetail({ userId, requestId: request.id, now: NOW });
    const confirm = () =>
      confirmApplication({
        userId: author.captain.id,
        requestId: request.id,
        applicationId: application.id,
        now: NOW,
      });
    const unverify = (userId: string, verifiedAt: Date | null = null) =>
      prisma.user.update({ where: { id: userId }, data: { verifiedAt } });

    // The host team is not ready: confirming is blocked, deleting is not.
    await unverify(author.members[0]!.id);
    expect(await detail(author.captain.id)).toMatchObject({
      remove: { problem: null },
      confirm: { problem: notReady },
      applications: [{ canConfirm: false, teamProblem: null }],
    });
    await expect(confirm()).rejects.toMatchObject({ message: notReady });
    await unverify(author.members[0]!.id, NOW);

    // The applicant team is no longer ready: only its application cannot be confirmed.
    await unverify(applicant.members[0]!.id);
    const applicantNotReady = `Das Team „${applicant.team.name}“ ist nicht mehr spielbereit (weniger als 5 verifizierte Spieler).`;
    expect(await detail(author.captain.id)).toMatchObject({
      confirm: { problem: null },
      applications: [{ canConfirm: false, teamProblem: applicantNotReady }],
    });
    await expect(confirm()).rejects.toMatchObject({ message: applicantNotReady });
    // Withdrawing needs no ready team.
    expect(await detail(applicant.captain.id)).toMatchObject({ withdraw: { problem: null } });
    await unverify(applicant.members[0]!.id, NOW);
    // A verified coach does not count as a player of the applicant team (SPEC N-1).
    const applicantRole = (role: MemberRole) =>
      prisma.teamMember.update({ where: { userId: applicant.members[0]!.id }, data: { role } });
    await applicantRole(MemberRole.COACH);
    expect(await detail(author.captain.id)).toMatchObject({
      applications: [{ canConfirm: false, teamProblem: applicantNotReady }],
    });
    await applicantRole(MemberRole.PLAYER);

    // The applicant team is banned without its application being withdrawn (a race with banTeam).
    await prisma.team.update({ where: { id: applicant.team.id }, data: { bannedAt: NOW } });
    const applicantInactive = `Das Team „${applicant.team.name}“ ist nicht mehr aktiv.`;
    expect(await detail(author.captain.id)).toMatchObject({
      applications: [{ canConfirm: false, teamProblem: applicantInactive }],
    });
    await expect(confirm()).rejects.toMatchObject({ message: applicantInactive });

    const late = await createReadyTeam();
    await unverify(late.members[0]!.id);
    expect(await detail(late.captain.id)).toMatchObject({
      apply: { problem: notReady },
      applyAs: { name: late.team.name, memberCount: 5 },
    });
    await expect(
      applyToRequest({ userId: late.captain.id, requestId: request.id, now: NOW }),
    ).rejects.toMatchObject({ message: notReady });
    // The captain rule comes first.
    expect(await detail(late.members[1]!.id)).toMatchObject({
      apply: { problem: "Das kann nur euer Captain." },
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
      actionProblem: "Das kann nur euer Captain.",
      opponent: {
        id: host.team.id,
        captainName: host.captain.name,
        captainDiscordId: host.captain.discordId,
      },
      cancellable: true,
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
      actionProblem: null,
      canCancel: true,
      cancelWouldBeLate: false,
      feedbackClosed: "Feedback ist erst ab der Startzeit möglich.",
      canGiveFeedback: false,
    });
    expect(await detail(guest.captain.id, AFTER_START)).toMatchObject({
      canCancel: false,
      feedbackClosed: null,
      canGiveFeedback: true,
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

  it("offers no scrim actions to unverified captains or banned teams", async () => {
    const { host, guest, scrim } = await bookScrim();
    await prisma.user.update({ where: { id: guest.captain.id }, data: { verifiedAt: null } });
    expect(
      await getScrimDetail({ userId: guest.captain.id, scrimId: scrim.id, now: AFTER_START }),
    ).toMatchObject({
      actionProblem: "Als Captain musst du für Scrim-Aktionen verifiziert sein.",
      canGiveFeedback: false,
    });
    await prisma.team.update({ where: { id: host.team.id }, data: { bannedAt: NOW } });
    expect(
      await getScrimDetail({ userId: host.captain.id, scrimId: scrim.id, now: NOW }),
    ).toMatchObject({ actionProblem: "Das Team ist gesperrt.", canCancel: false });
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
      team: null,
      upcoming: [],
      past: [],
      requests: [],
      applications: [],
    });
  });

  it("lists open requests, applications, the opponent captain and due feedback", async () => {
    const team = await createReadyTeam();
    const other = await createReadyTeam();
    const ownRequest = await createOpenRequest(team.captain.id);
    const otherRequest = await createOpenRequest(other.captain.id);
    const { application } = await applyToRequest({
      userId: team.captain.id,
      requestId: otherRequest.id,
      now: NOW,
    });
    const scrim = await book(other, team);

    const mine = await getMyScrims({ userId: team.members[0]!.id, now: NOW });
    expect(mine.team).toEqual({ name: team.team.name, tag: team.team.tag });
    expect(mine.requests).toEqual([expect.objectContaining({ id: ownRequest.id })]);
    // The accepted application of the booked scrim shows as a scrim, not as an application.
    expect(mine.applications).toEqual([
      expect.objectContaining({
        id: application.id,
        status: AppStatus.PENDING,
        requestId: otherRequest.id,
        team: { name: other.team.name, tag: other.team.tag },
      }),
    ]);
    expect(mine.upcoming).toMatchObject([
      {
        id: scrim.id,
        opponent: {
          name: other.team.name,
          captainName: other.captain.name,
          captainDiscordId: other.captain.discordId,
        },
        canGiveFeedback: false,
      },
    ]);

    const due = (userId: string) => getMyScrims({ userId, now: AFTER_START });
    expect((await due(team.captain.id)).past).toMatchObject([
      { id: scrim.id, feedbackGiven: false, canGiveFeedback: true },
    ]);
    // Only the captain gives feedback.
    expect((await due(team.members[0]!.id)).past).toMatchObject([{ canGiveFeedback: false }]);
    await answer(team, scrim.id, FeedbackOutcome.PLAYED, 4);
    expect((await due(team.captain.id)).past).toMatchObject([
      { feedbackGiven: true, canGiveFeedback: false },
    ]);
  });
});
