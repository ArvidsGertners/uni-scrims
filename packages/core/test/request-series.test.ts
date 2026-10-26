// Weekly recurring requests (SPEC N-25, ARCHITECTURE §5.27). The test DB is shared by all files, and
// postSeriesRequests works on every running series, so the tests check their own series only and
// end them all at the end, so the sweeper runs of later files post nothing for them.
import { RequestStatus, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  type RequestInput,
  banTeam,
  createRequest,
  deleteAccount,
  deleteRequest,
  dissolveTeam,
  endRequestSeries,
  exportAccountData,
  getMyScrims,
  getRequestDetail,
  leaveTeam,
  nextSeriesStart,
  postSeriesRequests,
  runSweeper,
  seriesPostsAt,
  transferCaptain,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_INPUT,
  createFullyVerifiedTeam,
  createOpenRequest,
  createTeamWithMembers,
  useAdmin,
} from "./helpers.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Thursdays at 20:00 Berlin from REQUEST_INPUT on; summer time ends on Sunday, 25.10.2026.
const W0 = new Date("2026-10-22T18:00:00Z");
const W1 = new Date("2026-10-29T19:00:00Z");
const W2 = new Date("2026-11-05T19:00:00Z");
const W3 = new Date("2026-11-12T19:00:00Z");
const W4 = new Date("2026-11-19T19:00:00Z");
/** Four more dates after W0. */
const UNTIL_W4 = "2026-11-19";

const admin = useAdmin();
const seriesIds: string[] = [];

afterAll(async () => {
  await prisma.requestSeries.updateMany({
    where: { id: { in: seriesIds }, endedAt: null },
    data: { endedAt: NOW },
  });
});

/** The first request of a weekly series of the captain's team, and the series. */
async function createSeries(
  captainId: string,
  overrides: Partial<RequestInput> & { now?: Date } = {},
) {
  const { now = NOW, ...input } = overrides;
  const teamId = (await prisma.team.findFirstOrThrow({ where: { captainId } })).id;
  const request = await createRequest({
    ...REQUEST_INPUT,
    repeatUntil: UNTIL_W4,
    ...input,
    userId: captainId,
    teamId,
    now,
  });
  if (request.seriesId) seriesIds.push(request.seriesId);
  const series = request.seriesId
    ? await prisma.requestSeries.findUniqueOrThrow({ where: { id: request.seriesId } })
    : null;
  return { request, series };
}

async function seriesOf(seriesId: string) {
  return prisma.requestSeries.findUniqueOrThrow({ where: { id: seriesId } });
}

/** Requests of the series by start, deleted and expired ones included. */
async function requestsOf(seriesId: string) {
  return prisma.scrimRequest.findMany({ where: { seriesId }, orderBy: { startsAt: "asc" } });
}

async function startsOf(seriesId: string) {
  return (await requestsOf(seriesId)).map((request) => request.startsAt);
}

/** Open requests of a team at `now` (SPEC P0-4). */
async function openCount(teamId: string, now: Date) {
  return prisma.scrimRequest.count({
    where: { teamId, status: RequestStatus.OPEN, startsAt: { gt: now } },
  });
}

/** Fills the team up to the limit of open requests at `now` with single requests, posted at `now`. */
async function fillUpToLimit(captainId: string, teamId: string, now: Date) {
  for (let day = 1; (await openCount(teamId, now)) < 5; day++) {
    const date = `2026-12-${String(day).padStart(2, "0")}`;
    await createRequest({ ...REQUEST_INPUT, date, userId: captainId, teamId, now });
  }
}

describe("createRequest with repeatUntil", () => {
  it("creates the first request and a weekly series up to the end date", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const { request, series } = await createSeries(captain.id, {
      maps: ["Ascent", "Bind"],
      note: " Lobby über Discord ",
    });
    expect(request).toMatchObject({
      startsAt: W0,
      seriesId: series!.id,
      note: "Lobby über Discord",
    });
    expect(series).toMatchObject({
      teamId: team.id,
      createdById: captain.id,
      format: REQUEST_INPUT.format,
      rankMin: REQUEST_INPUT.rankMin,
      rankMax: REQUEST_INPUT.rankMax,
      maps: ["Ascent", "Bind"],
      note: "Lobby über Discord",
      // 20:00 Berlin also after the end of summer time.
      nextStartsAt: W1,
      lastStartsAt: W4,
      endedAt: null,
      createdAt: NOW,
    });
  });

  it("makes a single request without an end date", async () => {
    for (const repeatUntil of ["", null, undefined]) {
      const { team, captain } = await createFullyVerifiedTeam();
      const { request, series } = await createSeries(captain.id, { repeatUntil });
      expect(request.seriesId).toBeNull();
      expect(series).toBeNull();
      expect(await prisma.requestSeries.count({ where: { teamId: team.id } })).toBe(0);
    }
  });

  it("allows an end date from one week up to 16 weeks after the first date", async () => {
    const cases = [
      { repeatUntil: "2026-10-29", last: W1 },
      // The end date need not be on the weekday: the last date is the one before it.
      { repeatUntil: "2026-11-11", last: W2 },
      { repeatUntil: "2027-02-11", last: new Date("2027-02-11T19:00:00Z") },
    ];
    for (const { repeatUntil, last } of cases) {
      const { captain } = await createFullyVerifiedTeam();
      const { series } = await createSeries(captain.id, { repeatUntil });
      expect(series).toMatchObject({ nextStartsAt: W1, lastStartsAt: last });
    }
  });

  it("rejects an end date too early, too late or invalid", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const cases = [
      { repeatUntil: "2026-10-28", key: "repeatUntilTooEarly" },
      { repeatUntil: "2026-10-22", key: "repeatUntilTooEarly" },
      { repeatUntil: "2027-02-12", key: "repeatUntilTooLate" },
      { repeatUntil: "2026-02-30", key: "repeatUntilInvalid" },
      { repeatUntil: "next week", key: "repeatUntilInvalid" },
    ];
    for (const { repeatUntil, key } of cases) {
      await expect(createSeries(captain.id, { repeatUntil })).rejects.toMatchObject({
        code: "INVALID",
        text: { key },
      });
    }
    // An invalid first date is reported as such, not as a server error.
    await expect(
      createSeries(captain.id, { date: "2026-02-30", repeatUntil: "2026-03-20" }),
    ).rejects.toMatchObject({ code: "INVALID", text: { key: "dateInvalid" } });
    expect(await prisma.scrimRequest.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("creates no series when the first request fails", async () => {
    const unverified = await createFullyVerifiedTeam({ verifiedCaptain: false });
    await expect(createSeries(unverified.captain.id)).rejects.toMatchObject({
      code: "NOT_VERIFIED",
    });

    const tooSoon = await createFullyVerifiedTeam();
    // 14:15 Berlin is 15 minutes after NOW.
    await expect(
      createSeries(tooSoon.captain.id, { date: "2026-10-21", time: "14:15" }),
    ).rejects.toMatchObject({ code: "INVALID", text: { key: "startTooSoon" } });

    const full = await createFullyVerifiedTeam();
    await fillUpToLimit(full.captain.id, full.team.id, NOW);
    await expect(createSeries(full.captain.id)).rejects.toMatchObject({ code: "CONFLICT" });

    for (const { team } of [unverified, tooSoon, full]) {
      expect(await prisma.requestSeries.count({ where: { teamId: team.id } })).toBe(0);
    }
  });
});

describe("dates of a series", () => {
  it("posts a date when the date a week before starts, in Berlin calendar weeks", () => {
    expect(seriesPostsAt(W1)).toEqual(W0);
    // Start of summer time on Sunday, 28.03.2027: 20:00 CET to 20:00 CEST is 167 hours.
    expect(seriesPostsAt(new Date("2027-04-01T18:00:00Z"))).toEqual(
      new Date("2027-03-25T19:00:00Z"),
    );
  });

  it("skips dates too close to their start and ends after the last one", () => {
    const series = { nextStartsAt: W1, lastStartsAt: W3 };
    expect(nextSeriesStart(series, W0)).toEqual(W1);
    // Exactly 30 minutes before the start is still allowed, as for a request by hand.
    expect(nextSeriesStart(series, new Date(W1.getTime() - 30 * MINUTE))).toEqual(W1);
    expect(nextSeriesStart(series, new Date(W1.getTime() - 30 * MINUTE + 1))).toEqual(W2);
    expect(nextSeriesStart(series, W3)).toBeNull();
  });
});

describe("postSeriesRequests", () => {
  it("posts the next date when the previous one starts", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id, { maps: ["Lotus"], note: "Discord: a#1" });
    await postSeriesRequests(new Date(W0.getTime() - 1));
    expect(await startsOf(series!.id)).toEqual([W0]);

    await postSeriesRequests(W0);
    expect(await requestsOf(series!.id)).toEqual([
      expect.objectContaining({ startsAt: W0 }),
      expect.objectContaining({
        teamId: team.id,
        createdById: captain.id,
        startsAt: W1,
        format: REQUEST_INPUT.format,
        rankMin: REQUEST_INPUT.rankMin,
        rankMax: REQUEST_INPUT.rankMax,
        maps: ["Lotus"],
        note: "Discord: a#1",
        status: RequestStatus.OPEN,
        createdAt: W0,
      }),
    ]);
    expect(await seriesOf(series!.id)).toMatchObject({ nextStartsAt: W2, endedAt: null });
  });

  it("keeps the time and the weekly rhythm across the start of summer time", async () => {
    const { captain } = await createFullyVerifiedTeam();
    // Thursday, 25.03.2027, 20:00 CET; the next Thursday is in summer time.
    const { series } = await createSeries(captain.id, {
      date: "2027-03-25",
      repeatUntil: "2027-04-01",
    });
    const first = new Date("2027-03-25T19:00:00Z");
    const second = new Date("2027-04-01T18:00:00Z");
    expect(series).toMatchObject({ nextStartsAt: second, lastStartsAt: second });
    // 168 hours before the second date the first has not started yet.
    await postSeriesRequests(new Date(first.getTime() - 1));
    expect(await startsOf(series!.id)).toEqual([first]);
    await postSeriesRequests(first);
    expect(await startsOf(series!.id)).toEqual([first, second]);
  });

  it("keeps a start after midnight on its night", async () => {
    const { captain } = await createFullyVerifiedTeam();
    // 01:00 on Friday, 23.10. (summer time) and on Friday, 30.10. (winter time).
    const { series } = await createSeries(captain.id, {
      date: "2026-10-23",
      time: "01:00",
      repeatUntil: "2026-10-30",
    });
    expect(series).toMatchObject({ nextStartsAt: new Date("2026-10-30T00:00:00Z") });
  });

  it("posts each date once, also after its request was deleted", async () => {
    const { captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id);
    await postSeriesRequests(W0);
    await postSeriesRequests(W0);
    const [, second] = await requestsOf(series!.id);
    expect(await startsOf(series!.id)).toEqual([W0, W1]);

    await deleteRequest({ userId: captain.id, requestId: second!.id, now: W0 });
    await postSeriesRequests(new Date(W0.getTime() + MINUTE));
    expect(await requestsOf(series!.id)).toEqual([
      expect.objectContaining({ startsAt: W0 }),
      expect.objectContaining({ startsAt: W1, status: RequestStatus.CANCELLED }),
    ]);
    // The series goes on with the following week.
    await postSeriesRequests(W1);
    expect(await startsOf(series!.id)).toEqual([W0, W1, W2]);
  });

  it("waits at the limit and posts as soon as a slot is free", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id);
    // At W0 its first request is no longer open; five others fill the limit.
    await fillUpToLimit(captain.id, team.id, W0);
    expect(await openCount(team.id, W0)).toBe(5);

    await postSeriesRequests(W0);
    expect(await startsOf(series!.id)).toEqual([W0]);
    expect(await seriesOf(series!.id)).toMatchObject({ nextStartsAt: W1 });

    const single = await prisma.scrimRequest.findFirstOrThrow({
      where: { teamId: team.id, seriesId: null, status: RequestStatus.OPEN },
    });
    await deleteRequest({ userId: captain.id, requestId: single.id, now: W0 });
    // Still posted exactly 30 minutes before the start.
    await postSeriesRequests(new Date(W1.getTime() - 30 * MINUTE));
    expect(await startsOf(series!.id)).toEqual([W0, W1]);
    expect(await openCount(team.id, W0)).toBe(5);
  });

  it("drops a date it could not post until 30 minutes before its start", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id);
    await fillUpToLimit(captain.id, team.id, W0);
    await postSeriesRequests(W0);
    const single = await prisma.scrimRequest.findFirstOrThrow({
      where: { teamId: team.id, seriesId: null, status: RequestStatus.OPEN },
    });
    await deleteRequest({ userId: captain.id, requestId: single.id, now: W0 });

    await postSeriesRequests(new Date(W1.getTime() - 30 * MINUTE + 1));
    expect(await startsOf(series!.id)).toEqual([W0]);
    expect(await seriesOf(series!.id)).toMatchObject({ nextStartsAt: W2, endedAt: null });
    await postSeriesRequests(W1);
    expect(await startsOf(series!.id)).toEqual([W0, W2]);
  });

  it("waits for a verified captain and goes on after a captain transfer", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 1,
      verifiedMembers: false,
    });
    const { series } = await createSeries(captain.id);
    const [member] = members;
    await transferCaptain({ userId: captain.id, teamId: team.id, newCaptainId: member!.id });
    await postSeriesRequests(W0);
    expect(await startsOf(series!.id)).toEqual([W0]);

    await prisma.user.update({ where: { id: member!.id }, data: { verifiedAt: NOW } });
    await postSeriesRequests(new Date(W0.getTime() + MINUTE));
    expect(await requestsOf(series!.id)).toEqual([
      expect.objectContaining({ startsAt: W0 }),
      // The note and its author stay those of the series.
      expect.objectContaining({ startsAt: W1, createdById: captain.id }),
    ]);
  });

  it("posts only the next possible date after an outage of weeks", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id);
    const now = new Date(W3.getTime() - HOUR);
    await postSeriesRequests(now);
    expect(await startsOf(series!.id)).toEqual([W0, W3]);
    expect(await openCount(team.id, now)).toBe(1);
    expect(await seriesOf(series!.id)).toMatchObject({ nextStartsAt: W4 });
  });

  it("ends after its last date, also when that date is dropped", async () => {
    const posted = await createFullyVerifiedTeam();
    const { series: last } = await createSeries(posted.captain.id, { repeatUntil: "2026-10-29" });
    await postSeriesRequests(W0);
    expect(await startsOf(last!.id)).toEqual([W0, W1]);
    expect(await seriesOf(last!.id)).toMatchObject({ endedAt: W0 });

    const dropped = await createFullyVerifiedTeam();
    const { series: skipped } = await createSeries(dropped.captain.id, {
      repeatUntil: "2026-10-29",
    });
    const tooLate = new Date(W1.getTime() - 29 * MINUTE);
    await postSeriesRequests(tooLate);
    expect(await startsOf(skipped!.id)).toEqual([W0]);
    expect(await seriesOf(skipped!.id)).toMatchObject({ endedAt: tooLate });
  });

  it("ends with a ban or dissolution of the team", async () => {
    const banned = await createFullyVerifiedTeam();
    const { series: bannedSeries, request } = await createSeries(banned.captain.id);
    await banTeam({ adminId: admin.id, teamId: banned.team.id, now: NOW });
    expect(await seriesOf(bannedSeries!.id)).toMatchObject({ endedAt: NOW });
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.CANCELLED });

    const dissolved = await createFullyVerifiedTeam();
    const { series: dissolvedSeries } = await createSeries(dissolved.captain.id);
    await dissolveTeam(dissolved.team.id, NOW);
    expect(await seriesOf(dissolvedSeries!.id)).toMatchObject({ endedAt: NOW });

    // Fallback for a ban written by hand, without retireTeamActivity.
    const byHand = await createFullyVerifiedTeam();
    const { series: byHandSeries } = await createSeries(byHand.captain.id);
    await prisma.team.update({ where: { id: byHand.team.id }, data: { bannedAt: NOW } });
    await postSeriesRequests(W0);
    expect(await startsOf(byHandSeries!.id)).toEqual([W0]);
    expect(await seriesOf(byHandSeries!.id)).toMatchObject({ endedAt: W0 });
  });

  it("is a step of the sweeper", async () => {
    const { captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id);
    const result = await runSweeper(W0, { purge: false });
    expect(result.postedSeriesRequests).toBeGreaterThanOrEqual(1);
    expect(await startsOf(series!.id)).toEqual([W0, W1]);
  });
});

describe("endRequestSeries", () => {
  it("lets only the verified captain end it and keeps the open requests", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const { series, request } = await createSeries(captain.id);
    const other = await createFullyVerifiedTeam();
    const end = (userId: string, seriesId = series!.id) =>
      endRequestSeries({ userId, seriesId, now: NOW });

    await expect(end(members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(end(other.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(end(captain.id, "no-series")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.user.update({ where: { id: captain.id }, data: { verifiedAt: null } });
    await expect(end(captain.id)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    await prisma.user.update({ where: { id: captain.id }, data: { verifiedAt: NOW } });

    await end(captain.id);
    expect(await seriesOf(series!.id)).toMatchObject({ endedAt: NOW });
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.OPEN });
    await expect(end(captain.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await postSeriesRequests(W0);
    expect(await startsOf(series!.id)).toEqual([W0]);
    expect(await prisma.requestSeries.count({ where: { teamId: team.id, endedAt: null } })).toBe(0);
  });
});

describe("reads", () => {
  it("shows the running series in the requests tab", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const { series, request } = await createSeries(captain.id, { maps: ["Haven"] });
    const single = await createOpenRequest(captain.id, { date: "2026-12-01" });
    const ended = await createSeries(captain.id, { date: "2026-12-02", repeatUntil: "2026-12-09" });
    await endRequestSeries({ userId: captain.id, seriesId: ended.series!.id, now: NOW });
    await createSeries((await createFullyVerifiedTeam()).captain.id);

    const mine = await getMyScrims({ userId: captain.id, now: NOW });
    expect(mine.series).toEqual([
      {
        id: series!.id,
        nextStartsAt: W1,
        postsAt: W0,
        lastStartsAt: W4,
        format: REQUEST_INPUT.format,
        rankMin: REQUEST_INPUT.rankMin,
        rankMax: REQUEST_INPUT.rankMax,
        maps: ["Haven"],
        due: false,
        blocked: null,
        end: { problem: null },
      },
    ]);
    const weekly = Object.fromEntries(mine.requests.map((entry) => [entry.id, entry.weekly]));
    expect(weekly).toMatchObject({ [request.id]: true, [single.id]: false });

    // Other members see the series without the button.
    const member = await getMyScrims({ userId: members[0]!.id, now: NOW });
    expect(member.series).toEqual([expect.objectContaining({ id: series!.id, end: null })]);

    // Due and waiting: the reason the sweeper sees, for the current captain.
    await fillUpToLimit(captain.id, team.id, W0);
    const full = await getMyScrims({ userId: members[0]!.id, now: W0 });
    expect(full.series).toEqual([expect.objectContaining({ due: true, blocked: "REQUEST_LIMIT" })]);
    await prisma.user.update({ where: { id: captain.id }, data: { verifiedAt: null } });
    const unverified = await getMyScrims({ userId: captain.id, now: W0 });
    expect(unverified.series).toEqual([
      expect.objectContaining({
        blocked: "CAPTAIN_NOT_VERIFIED",
        end: { problem: expect.objectContaining({ key: "captainNotVerified" }) },
      }),
    ]);
  });

  it("sorts the series by the next date shown, also before the sweeper skips a date", async () => {
    const { captain } = await createFullyVerifiedTeam();
    const thursdays = await createSeries(captain.id);
    // Fridays at 20:00 from 23.10. on, so the next date is 30.10.
    const fridays = await createSeries(captain.id, {
      date: "2026-10-23",
      repeatUntil: "2026-11-20",
    });
    const atNow = await getMyScrims({ userId: captain.id, now: NOW });
    expect(atNow.series.map((entry) => entry.id)).toEqual([
      thursdays.series!.id,
      fridays.series!.id,
    ]);
    // 29 minutes before W1 the Thursday date is too late: the next one shown is W2, after Friday,
    // and only due when W1 starts.
    const later = await getMyScrims({
      userId: captain.id,
      now: new Date(W1.getTime() - 29 * MINUTE),
    });
    expect(later.series).toEqual([
      expect.objectContaining({ id: fridays.series!.id, due: true, blocked: null }),
      expect.objectContaining({ id: thursdays.series!.id, nextStartsAt: W2, due: false }),
    ]);
  });

  it("marks a request of a series as weekly for its own team only", async () => {
    const { captain } = await createFullyVerifiedTeam();
    const { request } = await createSeries(captain.id);
    const other = await createFullyVerifiedTeam();
    const own = await getRequestDetail({ userId: captain.id, requestId: request.id, now: NOW });
    const foreign = await getRequestDetail({
      userId: other.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(own?.weekly).toBe(true);
    expect(foreign?.weekly).toBe(false);
  });
});

describe("account data", () => {
  it("clears the notes of the creator's series with the account, also after leaving", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const { series, request } = await createSeries(captain.id, { note: "Discord: alt#0001" });
    await transferCaptain({ userId: captain.id, teamId: team.id, newCaptainId: members[0]!.id });
    await leaveTeam({ userId: captain.id, teamId: team.id, now: NOW });

    await deleteAccount({ userId: captain.id, uploadDir: "/nonexistent", now: NOW });
    expect(await seriesOf(series!.id)).toMatchObject({ note: null, endedAt: null });
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ note: null });
    await postSeriesRequests(W0);
    expect(await requestsOf(series!.id)).toEqual([
      expect.objectContaining({ startsAt: W0 }),
      expect.objectContaining({ startsAt: W1, note: null, createdById: captain.id }),
    ]);
  });

  it("lists the series in the data export", async () => {
    const { team, captain } = await createFullyVerifiedTeam();
    const { series } = await createSeries(captain.id, { note: "Hi", maps: ["Split"] });
    const data = await exportAccountData({
      userId: captain.id,
      now: NOW,
      privacyPolicyUrl: "https://uniscrims.com/datenschutz",
      uploadDir: "/nonexistent",
    });
    expect(data.wiederkehrendeAnfragen).toEqual([
      {
        team: team.name,
        erstelltAm: NOW,
        nächsterTerminAm: series!.nextStartsAt,
        letzterTerminAm: W4,
        beendetAm: null,
        format: "1 Map",
        rangVon: "Silver",
        rangBis: "Platinum",
        maps: ["Split"],
        notiz: "Hi",
      },
    ]);
    expect(data.anfragen).toEqual([expect.objectContaining({ startAm: W0, wöchentlich: true })]);
  });
});
