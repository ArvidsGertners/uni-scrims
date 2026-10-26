import { AppStatus, FeedbackOutcome, MemberRole, Rank, ScrimStatus, prisma } from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  applyToRequest,
  cancelScrim,
  confirmApplication,
  getBoard,
  getMyScrims,
  getNavTeam,
  getRequestDetail,
  getRequestForm,
  getReliability,
  getScrimDetail,
  getTeamDashboard,
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
  createFullyVerifiedTeam,
  createUser,
} from "./helpers.ts";

const HOUR = 60 * 60 * 1000;
const AFTER_START = new Date(REQUEST_STARTS_AT.getTime() + HOUR);
type FullyVerifiedTeam = Awaited<ReturnType<typeof createFullyVerifiedTeam>>;

async function book(
  host: FullyVerifiedTeam,
  guest: FullyVerifiedTeam,
  overrides: Partial<typeof REQUEST_INPUT> = {},
) {
  const request = await createOpenRequest(host.captain.id, overrides);
  const { application } = await applyToRequest({
    userId: guest.captain.id,
    teamId: guest.team.id,
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
  team: FullyVerifiedTeam,
  scrimId: string,
  outcome: FeedbackOutcome,
  rating: number | null = null,
) {
  await submitFeedback({
    userId: team.captain.id,
    teamId: team.team.id,
    scrimId,
    outcome,
    rating,
    now: AFTER_START,
  });
}

describe("getReliability (§5.7)", () => {
  it("counts played scrims, no-shows and late cancellations and averages ratings from 3 on", async () => {
    const team = await createFullyVerifiedTeam();
    const opponents = [
      await createFullyVerifiedTeam(),
      await createFullyVerifiedTeam(),
      await createFullyVerifiedTeam(),
    ];
    for (const [index, opponent] of opponents.entries()) {
      const scrim = await book(team, opponent);
      await answer(team, scrim.id, FeedbackOutcome.PLAYED, 1);
      await answer(opponent, scrim.id, FeedbackOutcome.PLAYED, 5 - index);
    }
    const noShow = await book(team, opponents[0]!);
    await answer(team, noShow.id, FeedbackOutcome.WE_COULD_NOT);
    await answer(opponents[0]!, noShow.id, FeedbackOutcome.OPPONENT_NO_SHOW);
    const late = await book(team, opponents[1]!, SOON);
    await cancelScrim({
      userId: team.captain.id,
      teamId: team.team.id,
      scrimId: late.id,
      now: NOW,
    });
    const early = await book(team, opponents[1]!);
    await cancelScrim({
      userId: team.captain.id,
      teamId: team.team.id,
      scrimId: early.id,
      now: NOW,
    });
    const lateByOpponent = await book(team, opponents[2]!, SOON);
    await cancelScrim({
      userId: opponents[2]!.captain.id,
      teamId: opponents[2]!.team.id,
      scrimId: lateByOpponent.id,
      now: NOW,
    });
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
    const viewer = await createFullyVerifiedTeam({ rank: Rank.GOLD });
    const author = await createFullyVerifiedTeam();
    const matching = await createOpenRequest(author.captain.id);
    const higher = await createOpenRequest(author.captain.id, {
      rankMin: Rank.DIAMOND,
      rankMax: Rank.IMMORTAL,
    });
    const ids = (board: Awaited<ReturnType<typeof getBoard>>) =>
      board.requests.map((request) => request.id);

    const board = await getBoard({ userId: viewer.captain.id, now: NOW });
    expect(board.filter.ranks).toEqual([Rank.GOLD]);
    expect(ids(board)).toContain(matching.id);
    expect(ids(board)).not.toContain(higher.id);
    expect(ids(await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW }))).toEqual(
      expect.arrayContaining([matching.id, higher.id]),
    );
    const diamond = await getBoard({ userId: viewer.captain.id, ranks: [Rank.DIAMOND], now: NOW });
    expect(ids(diamond)).toContain(higher.id);
    expect(ids(diamond)).not.toContain(matching.id);
    // Started requests are no longer on the board.
    expect(
      ids(await getBoard({ userId: viewer.captain.id, now: REQUEST_STARTS_AT })),
    ).not.toContain(matching.id);
  });

  it("filters by several ranks: the range has to contain one of them", async () => {
    const viewer = await createFullyVerifiedTeam({ rank: Rank.GOLD });
    const author = await createFullyVerifiedTeam();
    const low = await createOpenRequest(author.captain.id, {
      rankMin: Rank.IRON,
      rankMax: Rank.BRONZE,
    });
    // Lies between the chosen ranks but contains neither.
    const between = await createOpenRequest(author.captain.id, {
      rankMin: Rank.GOLD,
      rankMax: Rank.PLATINUM,
    });
    const high = await createOpenRequest(author.captain.id, {
      rankMin: Rank.DIAMOND,
      rankMax: Rank.IMMORTAL,
    });
    const board = await getBoard({
      userId: viewer.captain.id,
      ranks: [Rank.IMMORTAL, Rank.BRONZE, Rank.IMMORTAL],
      now: NOW,
    });
    expect(board.filter.ranks).toEqual([Rank.BRONZE, Rank.IMMORTAL]);
    const ids = board.requests.map((request) => request.id);
    expect(ids).toEqual(expect.arrayContaining([low.id, high.id]));
    expect(ids).not.toContain(between.id);
    // No choice falls back to the own rank, "ALL" shows every range.
    expect(
      (await getBoard({ userId: viewer.captain.id, ranks: [], now: NOW })).filter.ranks,
    ).toEqual([Rank.GOLD]);
    expect(
      (await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW })).filter.ranks,
    ).toEqual([]);
  });

  it("filters by the Berlin calendar date of the start", async () => {
    const viewer = await createFullyVerifiedTeam();
    const author = await createFullyVerifiedTeam();
    const night = await createOpenRequest(author.captain.id, { date: "2026-10-23", time: "01:00" });
    const board = (date: string) =>
      getBoard({ userId: viewer.captain.id, date, ranks: "ALL", now: NOW });
    expect((await board("2026-10-23")).requests.map((r) => r.id)).toContain(night.id);
    expect((await board("2026-10-22")).requests.map((r) => r.id)).not.toContain(night.id);
    expect((await board("kaputt")).filter.date).toBeNull();
  });

  it("shows card data and the own application, without own requests", async () => {
    const viewer = await createFullyVerifiedTeam();
    const author = await createFullyVerifiedTeam();
    const request = await createOpenRequest(author.captain.id);
    const own = await createOpenRequest(viewer.captain.id);
    const { application } = await applyToRequest({
      userId: viewer.captain.id,
      teamId: viewer.team.id,
      requestId: request.id,
      now: NOW,
    });
    const withdrawn = await createFullyVerifiedTeam();
    const { application: withdrawnApplication } = await applyToRequest({
      userId: withdrawn.captain.id,
      teamId: withdrawn.team.id,
      requestId: request.id,
      now: NOW,
    });
    await withdrawApplication({
      userId: withdrawn.captain.id,
      applicationId: withdrawnApplication.id,
      now: NOW,
    });

    const board = await getBoard({ userId: viewer.members[0]!.id, ranks: "ALL", now: NOW });
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
    expect(application.status).toBe(AppStatus.PENDING);
  });

  it("hides requests of banned teams and rejects banned users", async () => {
    const viewer = await createFullyVerifiedTeam();
    const author = await createFullyVerifiedTeam();
    const request = await createOpenRequest(author.captain.id);
    await prisma.team.update({ where: { id: author.team.id }, data: { bannedAt: NOW } });
    const board = await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW });
    expect(board.requests.map((r) => r.id)).not.toContain(request.id);
    const banned = await createUser({ banned: true });
    await expect(getBoard({ userId: banned.id, now: NOW })).rejects.toMatchObject({
      code: "BANNED",
    });
  });
});

describe("getRequestForm", () => {
  const form = (userId: string, now = NOW) => getRequestForm({ userId, now });
  // Keys of the messages the page renders (§5.21).
  const BANNED = { kind: "TEAM_BANNED", text: { key: "teamBanned" } };
  const NOT_CAPTAIN = { kind: "NOT_CAPTAIN", text: { key: "notCaptain" } };
  const NOT_VERIFIED = { kind: "CAPTAIN_NOT_VERIFIED", text: { key: "captainNotVerified" } };
  const LIMIT = { kind: "REQUEST_LIMIT", text: { key: "requestLimit" } };

  it("lists every reason for the captain; members only learn that the captain has to act", async () => {
    expect(await form((await createUser()).id)).toBeNull();
    // Unverified captain; how many players are verified does not matter (SPEC N-21).
    const team = await createFullyVerifiedTeam({ verifiedCaptain: false });
    expect(await form(team.captain.id)).toEqual({
      // The active team, which the form posts for (§5.20).
      teamId: team.team.id,
      teamName: team.team.name,
      rank: Rank.GOLD,
      rankRange: { rankMin: Rank.GOLD, rankMax: Rank.GOLD },
      problems: [NOT_VERIFIED],
    });
    expect(await form(team.members[0]!.id)).toMatchObject({ problems: [NOT_CAPTAIN] });

    // A ban is final, so it is the only reason, for the captain and for members.
    await prisma.team.update({ where: { id: team.team.id }, data: { bannedAt: NOW } });
    expect(await form(team.captain.id)).toMatchObject({ problems: [BANNED] });
    expect(await form(team.members[0]!.id)).toMatchObject({ problems: [BANNED] });
    // createRequest rejects with the same reason (here already before the team lock).
    await expect(createOpenRequest(team.captain.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      text: BANNED.text,
    });
  });

  it("applies the limit of open requests like createRequest, next to other reasons", async () => {
    const team = await createFullyVerifiedTeam();
    expect(await form(team.captain.id)).toMatchObject({ problems: [] });
    for (const time of ["11:00", "12:00", "13:00", "14:00", "15:00"]) {
      await createOpenRequest(team.captain.id, { date: "2026-10-22", time });
    }
    const sixth = () => createOpenRequest(team.captain.id, { date: "2026-10-22", time: "16:00" });
    expect(await form(team.captain.id)).toMatchObject({ problems: [LIMIT] });
    await expect(sixth()).rejects.toMatchObject({ code: "CONFLICT", text: LIMIT.text });

    // Unverified players change nothing (SPEC N-21); an unverified captain comes first.
    await prisma.user.update({ where: { id: team.members[0]!.id }, data: { verifiedAt: null } });
    expect(await form(team.captain.id)).toMatchObject({ problems: [LIMIT] });
    await prisma.user.update({ where: { id: team.captain.id }, data: { verifiedAt: null } });
    expect(await form(team.captain.id)).toMatchObject({ problems: [NOT_VERIFIED, LIMIT] });
    await expect(sixth()).rejects.toMatchObject({ code: "NOT_VERIFIED", text: NOT_VERIFIED.text });
    // A request that has started no longer counts (11:00 Berlin = 09:00 UTC).
    expect(await form(team.captain.id, new Date("2026-10-22T09:00:00Z"))).toMatchObject({
      problems: [NOT_VERIFIED],
    });
  });
});

describe("getRequestDetail", () => {
  it("shows applications only to the creating team (§7)", async () => {
    const author = await createFullyVerifiedTeam();
    const applicant = await createFullyVerifiedTeam({ rank: Rank.IRON });
    const outsider = await createUser();
    const request = await createOpenRequest(author.captain.id);
    const { application } = await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
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
    const onlyCaptain = { problem: { key: "notCaptain" } };
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
    const author = await createFullyVerifiedTeam();
    const applicant = await createFullyVerifiedTeam();
    const request = await createOpenRequest(author.captain.id);
    const { application } = await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
      requestId: request.id,
      now: NOW,
    });
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
    const admitOnlyFullyVerified = (verifiedApplicantsOnly: boolean) =>
      prisma.team.update({ where: { id: author.team.id }, data: { verifiedApplicantsOnly } });

    // Unverified players block nothing (SPEC N-21); the badge is gone.
    await unverify(author.members[0]!.id);
    await unverify(applicant.members[0]!.id);
    expect(await detail(author.captain.id)).toMatchObject({
      team: { fullyVerified: false },
      verifiedApplicantsOnly: false,
      remove: { problem: null },
      confirm: { problem: null },
      applications: [{ canConfirm: true, teamProblem: null, team: { fullyVerified: false } }],
    });

    // The host admits only fully verified teams: only that application cannot be confirmed.
    await admitOnlyFullyVerified(true);
    const applicantNotFullyVerified = {
      key: "applicantTeamNotFullyVerified",
      params: { team: applicant.team.name },
    };
    expect(await detail(author.captain.id)).toMatchObject({
      verifiedApplicantsOnly: true,
      confirm: { problem: null },
      applications: [{ canConfirm: false, teamProblem: applicantNotFullyVerified }],
    });
    await expect(confirm()).rejects.toMatchObject({ text: applicantNotFullyVerified });
    // Withdrawing does not depend on it.
    expect(await detail(applicant.captain.id)).toMatchObject({ withdraw: { problem: null } });
    await unverify(applicant.members[0]!.id, NOW);
    expect(await detail(author.captain.id)).toMatchObject({
      applications: [{ canConfirm: true, teamProblem: null, team: { fullyVerified: true } }],
    });
    // A verified coach does not count as a player of the applicant team (SPEC N-1).
    const applicantRole = (role: MemberRole) =>
      prisma.teamMember.updateMany({ where: { userId: applicant.members[0]!.id }, data: { role } });
    await applicantRole(MemberRole.COACH);
    expect(await detail(author.captain.id)).toMatchObject({
      applications: [{ canConfirm: false, teamProblem: applicantNotFullyVerified }],
    });
    await applicantRole(MemberRole.PLAYER);

    // The applicant team is banned without its application being withdrawn (a race with banTeam).
    await prisma.team.update({ where: { id: applicant.team.id }, data: { bannedAt: NOW } });
    const applicantInactive = {
      key: "applicantTeamInactive",
      params: { team: applicant.team.name },
    };
    expect(await detail(author.captain.id)).toMatchObject({
      applications: [{ canConfirm: false, teamProblem: applicantInactive }],
    });
    await expect(confirm()).rejects.toMatchObject({ text: applicantInactive });

    // A team without the badge cannot apply while the setting is on.
    const late = await createFullyVerifiedTeam();
    await unverify(late.members[0]!.id);
    const mustBeFullyVerified = {
      key: "applicantsMustBeFullyVerified",
      params: { team: author.team.name },
    };
    expect(await detail(late.captain.id)).toMatchObject({
      apply: { problem: mustBeFullyVerified },
      applyAs: { name: late.team.name, memberCount: 5 },
    });
    await expect(
      applyToRequest({
        userId: late.captain.id,
        teamId: late.team.id,
        requestId: request.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", text: mustBeFullyVerified });
    // The captain rule comes first.
    expect(await detail(late.members[1]!.id)).toMatchObject({
      apply: { problem: { key: "notCaptain" } },
    });
    await admitOnlyFullyVerified(false);
    expect(await detail(late.captain.id)).toMatchObject({ apply: { problem: null } });
  });

  it("links the scrim for both teams after booking and hides banned teams' requests", async () => {
    const { host, guest, request, scrim } = await bookScrim();
    const outsider = await createFullyVerifiedTeam();
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
    const outsider = await createFullyVerifiedTeam();
    const detail = (userId: string, now = NOW) =>
      getScrimDetail({ userId, scrimId: scrim.id, now });

    expect(await detail(outsider.captain.id)).toBeNull();
    expect(await detail(guest.members[0]!.id)).toMatchObject({
      isHost: false,
      actionProblem: { key: "notCaptain" },
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
      feedbackClosed: { key: "feedbackNotYet" },
      canGiveFeedback: false,
    });
    expect(await detail(guest.captain.id, AFTER_START)).toMatchObject({
      canCancel: false,
      feedbackClosed: null,
      canGiveFeedback: true,
    });
    await submitFeedback({
      userId: guest.captain.id,
      teamId: guest.team.id,
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
      actionProblem: { key: "captainNotVerified" },
      canGiveFeedback: false,
    });
    await prisma.team.update({ where: { id: host.team.id }, data: { bannedAt: NOW } });
    expect(
      await getScrimDetail({ userId: host.captain.id, scrimId: scrim.id, now: NOW }),
    ).toMatchObject({ actionProblem: { key: "teamBanned" }, canCancel: false });
  });

  it("lists upcoming and past scrims of the own team", async () => {
    const team = await createFullyVerifiedTeam();
    const opponent = await createFullyVerifiedTeam();
    const soon = await book(team, opponent, SOON);
    const later = await book(opponent, team);
    const cancelled = await book(team, opponent);
    await cancelScrim({
      userId: team.captain.id,
      teamId: team.team.id,
      scrimId: cancelled.id,
      now: NOW,
    });

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
    const team = await createFullyVerifiedTeam();
    const other = await createFullyVerifiedTeam();
    const ownRequest = await createOpenRequest(team.captain.id);
    const otherRequest = await createOpenRequest(other.captain.id);
    const { application } = await applyToRequest({
      userId: team.captain.id,
      teamId: team.team.id,
      requestId: otherRequest.id,
      now: NOW,
    });
    const scrim = await book(other, team);

    const mine = await getMyScrims({ userId: team.members[0]!.id, now: NOW });
    expect(mine.team).toEqual({
      id: team.team.id,
      name: team.team.name,
      tag: team.team.tag,
      logo: null,
    });
    expect(mine.requests).toEqual([expect.objectContaining({ id: ownRequest.id })]);
    // The accepted application of the booked scrim shows as a scrim, not as an application.
    expect(mine.applications).toEqual([
      expect.objectContaining({
        id: application.id,
        status: AppStatus.PENDING,
        requestId: otherRequest.id,
        team: { id: other.team.id, name: other.team.name, tag: other.team.tag, logo: null },
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

describe("getTeamDashboard (§5.14)", () => {
  it("is null without a team", async () => {
    expect(await getTeamDashboard({ userId: (await createUser()).id, now: NOW })).toBeNull();
  });

  it("adds the board's reliability and no scrim to the team page", async () => {
    const team = await createFullyVerifiedTeam();
    const dashboard = await getTeamDashboard({ userId: team.members[0]!.id, now: NOW });
    expect(dashboard).toMatchObject({ id: team.team.id, nextScrim: null });
    expect(dashboard?.reliability).toEqual(await getReliability(team.team.id));
  });

  it("shows the earliest upcoming scheduled scrim, for both sides", async () => {
    const first = await bookScrim();
    const second = await bookScrim();
    // The same host team earlier: it comes first.
    const earlier = new Date(first.scrim.startsAt.getTime() - HOUR);
    await prisma.scrim.update({
      where: { id: second.scrim.id },
      data: { hostTeamId: first.host.team.id, startsAt: earlier },
    });

    const host = await getTeamDashboard({ userId: first.host.captain.id, now: NOW });
    expect(host?.nextScrim).toEqual({
      id: second.scrim.id,
      startsAt: earlier,
      format: second.scrim.format,
      opponent: {
        id: second.guest.team.id,
        name: second.guest.team.name,
        tag: second.guest.team.tag,
        logo: null,
      },
    });
    const guest = await getTeamDashboard({ userId: first.guest.members[0]!.id, now: NOW });
    expect(guest?.nextScrim).toMatchObject({
      id: first.scrim.id,
      opponent: { id: first.host.team.id },
    });
  });

  it("skips past, cancelled and disputed scrims", async () => {
    const { host, scrim } = await bookScrim();
    const after = new Date(scrim.startsAt.getTime() + HOUR);
    expect((await getTeamDashboard({ userId: host.captain.id, now: after }))?.nextScrim).toBeNull();
    for (const status of [ScrimStatus.CANCELLED, ScrimStatus.DISPUTED]) {
      await prisma.scrim.update({ where: { id: scrim.id }, data: { status } });
      expect(
        (await getTeamDashboard({ userId: host.captain.id, now: NOW }))?.nextScrim,
        status,
      ).toBeNull();
    }
  });
});

describe("getNavTeam (§5.15)", () => {
  it("names the own team with its logo, and nothing without one", async () => {
    const { team, members, captain } = await createFullyVerifiedTeam();
    const logoAt = new Date("2026-10-20T10:00:00Z");
    await prisma.team.update({ where: { id: team.id }, data: { logoUpdatedAt: logoAt } });
    await prisma.teamLogo.create({
      data: { teamId: team.id, background: "DARK", data: Buffer.from([1]) },
    });
    const entry = {
      id: team.id,
      name: team.name,
      tag: team.tag,
      logo: { version: logoAt.getTime(), backgrounds: ["DARK"] },
      active: true,
    };
    expect(await getNavTeam(members[0]!.id)).toEqual({
      team: entry,
      teams: [entry],
      teamCount: 1,
      teamLimit: 5,
      limitProblem: null,
      verificationNeeded: false,
    });
    const none = {
      team: null,
      teams: [],
      teamCount: 0,
      teamLimit: 5,
      limitProblem: null,
      verificationNeeded: false,
    };
    expect(await getNavTeam((await createUser()).id)).toEqual(none);
    await prisma.team.update({ where: { id: team.id }, data: { dissolvedAt: NOW } });
    expect(await getNavTeam(captain.id)).toEqual(none);
  });

  it("is only for active accounts, like the team page", async () => {
    await expect(getNavTeam((await createUser({ banned: true })).id)).rejects.toMatchObject({
      code: "BANNED",
    });
    await expect(getNavTeam((await createUser({ legacy: true })).id)).rejects.toMatchObject({
      code: "ACCOUNT_INCOMPLETE",
    });
  });
});
