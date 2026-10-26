// Direct requests and fixed partners (SPEC N-26, ARCHITECTURE §5.28). The test DB is shared by all
// files and postSeriesRequests works on every running series, so the partnerships made here are
// ended at the end, and the checks only look at this file's rows.
import { NotifChannel, NotifType, Rank, RequestStatus, ScrimStatus, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  type RequestInput,
  acceptDirectRequest,
  banTeam,
  cancelScrim,
  createRequest,
  declineDirectRequest,
  deleteRequest,
  dissolveTeam,
  endRequestSeries,
  expireRequests,
  exportAccountData,
  getBoard,
  getMyScrims,
  getPublicBoard,
  getPublicTeamLogo,
  getRequestDetail,
  getRequestForm,
  getScrimDetail,
  getTeamList,
  postSeriesRequests,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_INPUT,
  REQUEST_STARTS_AT,
  bookScrim,
  createFullyVerifiedTeam,
  createOpenRequest,
  createTeamWithMembers,
  useAdmin,
} from "./helpers.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Thursdays at 20:00 Berlin from REQUEST_INPUT on; summer time ends on Sunday, 25.10.2026.
const W0 = REQUEST_STARTS_AT;
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

type Team = Awaited<ReturnType<typeof createTeamWithMembers>>;

/** A direct request of `from` to `to`, as the form with a target posts it. */
async function sendDirect(from: Team, to: { id: string }, overrides: Partial<RequestInput> = {}) {
  return createRequest({
    ...REQUEST_INPUT,
    ...overrides,
    userId: from.captain.id,
    teamId: from.team.id,
    targetTeamId: to.id,
    now: NOW,
  });
}

/** Two teams, a weekly direct request of A to B up to W4, accepted by B at NOW. */
async function partnership() {
  const a = await createFullyVerifiedTeam();
  const b = await createFullyVerifiedTeam();
  const request = await sendDirect(a, b.team, { repeatUntil: UNTIL_W4 });
  const scrim = await acceptDirectRequest({
    userId: b.captain.id,
    requestId: request.id,
    now: NOW,
  });
  const { seriesId } = await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } });
  seriesIds.push(seriesId!);
  return { a, b, request, scrim, seriesId: seriesId! };
}

async function seriesOf(seriesId: string) {
  return prisma.requestSeries.findUniqueOrThrow({ where: { id: seriesId } });
}

/** The scrims of a series by start: booked dates and their requests. */
async function scrimsOf(seriesId: string) {
  return prisma.scrim.findMany({
    where: { request: { seriesId } },
    orderBy: { startsAt: "asc" },
    include: { request: true },
  });
}

/** Notification keys of a type for a team, without the channel noise of fanned-out children. */
async function notificationsTo(teamId: string, type: NotifType) {
  return prisma.notification.findMany({
    where: { targetTeamId: teamId, type, channel: NotifChannel.PERSONAL },
  });
}

describe("createRequest with a target", () => {
  it("sends a direct request without rank range that is not on the board", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const viewer = await createFullyVerifiedTeam();
    await prisma.teamLogo.create({
      data: { teamId: a.team.id, background: "DARK", data: new Uint8Array([1, 2, 3]) },
    });
    await prisma.team.update({ where: { id: a.team.id }, data: { logoUpdatedAt: NOW } });

    const request = await sendDirect(a, b.team, { maps: ["Ascent"], note: "Discord: a#1" });
    expect(request).toMatchObject({
      teamId: a.team.id,
      targetTeamId: b.team.id,
      startsAt: W0,
      status: RequestStatus.OPEN,
      // No rank range for a direct request (§5.28), whatever the form sent.
      rankMin: Rank.IRON,
      rankMax: Rank.RADIANT,
      maps: ["Ascent"],
      note: "Discord: a#1",
      weeklyLastStartsAt: null,
      seriesId: null,
    });
    const board = await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW });
    expect(board.requests.map(({ id }) => id)).not.toContain(request.id);
    const publicBoard = await getPublicBoard({ ranks: "ALL", now: NOW });
    expect(publicBoard.requests.map(({ id }) => id)).not.toContain(request.id);
    await expect(
      getPublicTeamLogo({ teamId: a.team.id, background: "DARK", now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const [received] = await notificationsTo(b.team.id, NotifType.DIRECT_REQUEST_RECEIVED);
    expect(received).toMatchObject({
      requestId: request.id,
      dedupeKey: `DIRECT_REQUEST_RECEIVED:${request.id}:${b.team.id}:PERSONAL`,
      payload: {
        teamName: a.team.name,
        startsAt: W0.toISOString(),
        format: REQUEST_INPUT.format,
        weeklyUntil: null,
      },
    });
  });

  it("proposes a partnership with an end date, without a series yet", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const request = await sendDirect(a, b.team, { repeatUntil: UNTIL_W4 });
    expect(request).toMatchObject({ weeklyLastStartsAt: W4, seriesId: null });
    expect(await prisma.requestSeries.count({ where: { teamId: a.team.id } })).toBe(0);
    const [received] = await notificationsTo(b.team.id, NotifType.DIRECT_REQUEST_RECEIVED);
    expect(received!.payload).toMatchObject({ weeklyUntil: W4.toISOString() });
  });

  it("counts toward the limit of open requests", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    for (let day = 1; day <= 4; day++) {
      await createOpenRequest(a.captain.id, { date: `2026-12-0${day}` });
    }
    await sendDirect(a, b.team);
    await expect(createOpenRequest(a.captain.id, { date: "2026-12-05" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(sendDirect(a, b.team, { date: "2026-12-06" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("needs another, active team as target; hidden teams can be asked", async () => {
    const a = await createFullyVerifiedTeam();
    await expect(sendDirect(a, a.team)).rejects.toMatchObject({ code: "INVALID" });
    await expect(sendDirect(a, { id: "no-such-team" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const banned = await createTeamWithMembers({ banned: true });
    await expect(sendDirect(a, banned.team)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const dissolved = await createTeamWithMembers();
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });
    await expect(sendDirect(a, dissolved.team)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const hidden = await createTeamWithMembers();
    await prisma.team.update({ where: { id: hidden.team.id }, data: { listed: false } });
    await expect(sendDirect(a, hidden.team)).resolves.toMatchObject({
      targetTeamId: hidden.team.id,
    });
    expect(await prisma.scrimRequest.count({ where: { teamId: a.team.id } })).toBe(1);
  });

  it("needs a verified captain, but not the badge the target requires of applicants", async () => {
    const unverified = await createTeamWithMembers({ verifiedCaptain: false });
    const b = await createFullyVerifiedTeam();
    await expect(sendDirect(unverified, b.team)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    // Only the captain verified: no badge, while the target admits only fully verified applicants.
    const a = await createTeamWithMembers();
    await prisma.team.update({
      where: { id: b.team.id },
      data: { verifiedApplicantsOnly: true },
    });
    const request = await sendDirect(a, b.team);
    await expect(
      acceptDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW }),
    ).resolves.toMatchObject({ hostTeamId: a.team.id, guestTeamId: b.team.id });
  });
});

describe("getRequestDetail and getRequestForm for direct requests", () => {
  it("shows a direct request only to both teams, with the answers for the target's captain", async () => {
    const a = await createTeamWithMembers({ extraMembers: 1 });
    const b = await createTeamWithMembers({ extraMembers: 1 });
    const other = await createFullyVerifiedTeam();
    const request = await sendDirect(a, b.team, { repeatUntil: UNTIL_W4 });
    const detail = (userId: string) =>
      getRequestDetail({ userId, requestId: request.id, now: NOW });

    expect(await detail(other.captain.id)).toBeNull();
    expect(await detail(a.members[0]!.id)).toMatchObject({
      direct: { target: { id: b.team.id }, weeklyUntil: W4, incoming: false },
      accept: null,
      apply: null,
      remove: null,
    });
    expect(await detail(a.captain.id)).toMatchObject({
      direct: { incoming: false },
      accept: null,
      remove: { problem: null },
    });
    expect(await detail(b.captain.id)).toMatchObject({
      team: { id: a.team.id },
      direct: { target: { id: b.team.id }, incoming: true },
      accept: { problem: null },
      decline: { problem: null },
      apply: null,
      applications: null,
    });
    expect(await detail(b.members[0]!.id)).toMatchObject({ accept: null, decline: null });

    await prisma.user.update({ where: { id: b.captain.id }, data: { verifiedAt: null } });
    expect(await detail(b.captain.id)).toMatchObject({
      accept: { problem: { key: "captainNotVerified" } },
    });
  });

  it("names the requested team when another own team is active", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const request = await sendDirect(a, b.team);
    // The captain of B also captains another team, which is active (§5.20).
    const second = await prisma.team.create({
      data: {
        name: `Zweit ${request.id}`,
        nameNormalized: `zweit ${request.id}`,
        tag: "TWO",
        captainId: b.captain.id,
        createdAt: NOW,
      },
    });
    await prisma.teamMember.create({
      data: { teamId: second.id, userId: b.captain.id, joinedAt: new Date(NOW.getTime() + 1) },
    });
    await prisma.user.update({ where: { id: b.captain.id }, data: { activeTeamId: second.id } });
    expect(
      await getRequestDetail({ userId: b.captain.id, requestId: request.id, now: NOW }),
    ).toMatchObject({ otherOwnTeam: { id: b.team.id }, accept: null });
  });

  it("gives the form the target's card or the reason", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const form = (targetTeamId: string) =>
      getRequestForm({ userId: a.captain.id, now: NOW, targetTeamId });
    expect(await form(b.team.id)).toMatchObject({
      target: { team: { id: b.team.id, name: b.team.name }, problem: null },
    });
    expect(await form(a.team.id)).toMatchObject({
      target: { team: null, problem: { key: "ownTeamTarget" } },
    });
    expect(await form("no-such-team")).toMatchObject({
      target: { team: null, problem: { key: "targetTeamNotFound" } },
    });
    expect(await getRequestForm({ userId: a.captain.id, now: NOW })).toMatchObject({
      target: null,
    });
  });
});

describe("acceptDirectRequest", () => {
  it("books the scrim like a confirmed application, the requesting team as host", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const request = await sendDirect(a, b.team, { maps: ["Bind"] });
    const scrim = await acceptDirectRequest({
      userId: b.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(scrim).toMatchObject({
      requestId: request.id,
      hostTeamId: a.team.id,
      guestTeamId: b.team.id,
      startsAt: W0,
      maps: ["Bind"],
      status: ScrimStatus.SCHEDULED,
    });
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.BOOKED, seriesId: null });
    const entries = await prisma.notification.findMany({
      where: { scrimId: scrim.id },
      select: { type: true },
    });
    const count = (type: NotifType) => entries.filter((entry) => entry.type === type).length;
    // Both teams, personal and team channel, as in confirmApplication (§5.4).
    for (const type of [
      NotifType.SCRIM_BOOKED,
      NotifType.REMINDER_24H,
      NotifType.REMINDER_1H,
      NotifType.FEEDBACK_PROMPT,
    ]) {
      expect(count(type)).toBe(4);
    }
  });

  it("is only for the verified captain of the requested team, while the request is open", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createTeamWithMembers({ extraMembers: 1 });
    const other = await createFullyVerifiedTeam();
    const request = await sendDirect(a, b.team);
    const accept = (userId: string, now = NOW) =>
      acceptDirectRequest({ userId, requestId: request.id, now });
    await expect(accept(a.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accept(other.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accept(b.members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(accept(b.captain.id, W0)).rejects.toMatchObject({ code: "CONFLICT" });

    const board = await createOpenRequest(a.captain.id, { date: "2026-12-01" });
    await expect(
      acceptDirectRequest({ userId: b.captain.id, requestId: board.id, now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The requesting team is no longer active (without its retirement, which closes the request).
    await prisma.team.update({ where: { id: a.team.id }, data: { bannedAt: NOW } });
    await expect(accept(b.captain.id)).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "requestingTeamInactive" },
    });
    expect(await prisma.scrim.count({ where: { requestId: request.id } })).toBe(0);
  });
});

describe("declining, withdrawing and expiring", () => {
  it("declines and tells the requesting team; the request cannot be accepted afterwards", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const request = await sendDirect(a, b.team);
    await expect(
      declineDirectRequest({ userId: a.captain.id, requestId: request.id, now: NOW }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await declineDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW });
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.DECLINED });
    const [declined] = await notificationsTo(a.team.id, NotifType.DIRECT_REQUEST_DECLINED);
    expect(declined).toMatchObject({
      requestId: request.id,
      payload: { teamName: b.team.name, startsAt: W0.toISOString() },
    });
    await expect(
      acceptDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      declineDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // No longer open: it no longer counts toward the limit, and B no longer sees it.
    expect((await getMyScrims({ userId: b.captain.id, now: NOW })).incoming).toEqual([]);
    expect((await getMyScrims({ userId: a.captain.id, now: NOW })).requests).toEqual([]);
  });

  it("tells the requested team about a withdrawal, but not about the expiry", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const withdrawn = await sendDirect(a, b.team);
    await deleteRequest({ userId: a.captain.id, requestId: withdrawn.id, now: NOW });
    const [deleted] = await notificationsTo(b.team.id, NotifType.REQUEST_DELETED);
    expect(deleted).toMatchObject({
      requestId: withdrawn.id,
      payload: { teamName: a.team.name, startsAt: W0.toISOString(), direct: true },
    });

    const unanswered = await sendDirect(a, b.team, { date: "2026-10-23" });
    await expireRequests(new Date("2026-10-23T18:00:00Z"));
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: unanswered.id } }),
    ).toMatchObject({ status: RequestStatus.EXPIRED });
    expect(
      await prisma.notification.count({
        where: { requestId: unanswered.id, type: { not: NotifType.DIRECT_REQUEST_RECEIVED } },
      }),
    ).toBe(0);
  });
});

describe("fixed partners", () => {
  it("creates the partnership when the first date is accepted", async () => {
    const { a, b, request, scrim, seriesId } = await partnership();
    expect(scrim).toMatchObject({ hostTeamId: a.team.id, guestTeamId: b.team.id, startsAt: W0 });
    expect(await seriesOf(seriesId)).toMatchObject({
      teamId: a.team.id,
      targetTeamId: b.team.id,
      createdById: a.captain.id,
      format: request.format,
      nextStartsAt: W1,
      lastStartsAt: W4,
      endedAt: null,
    });
  });

  it("books each further date when the previous one starts, also across the DST change", async () => {
    const { a, b, seriesId } = await partnership();
    await postSeriesRequests(new Date(W0.getTime() - MINUTE));
    expect((await scrimsOf(seriesId)).map(({ startsAt }) => startsAt)).toEqual([W0]);

    await postSeriesRequests(W0);
    const [, next] = await scrimsOf(seriesId);
    expect(next).toMatchObject({
      hostTeamId: a.team.id,
      guestTeamId: b.team.id,
      // 20:00 Berlin after the end of summer time.
      startsAt: W1,
      status: ScrimStatus.SCHEDULED,
      request: { status: RequestStatus.BOOKED, targetTeamId: b.team.id, createdAt: W0 },
    });
    expect(
      await prisma.notification.count({
        where: { scrimId: next!.id, type: NotifType.SCRIM_BOOKED },
      }),
    ).toBe(4);
    expect(await seriesOf(seriesId)).toMatchObject({ nextStartsAt: W2, endedAt: null });
    // A second run books nothing more.
    await postSeriesRequests(W0);
    expect(await scrimsOf(seriesId)).toHaveLength(2);
  });

  it("is not limited by the open requests of the requesting team", async () => {
    const { a, seriesId } = await partnership();
    for (let day = 1; day <= 5; day++) {
      await createOpenRequest(a.captain.id, { date: `2026-12-0${day}` });
    }
    await postSeriesRequests(W0);
    expect(await scrimsOf(seriesId)).toHaveLength(2);
  });

  it("waits for both captains to be verified, until 30 minutes before the start", async () => {
    const { b, seriesId } = await partnership();
    await prisma.user.update({ where: { id: b.captain.id }, data: { verifiedAt: null } });
    await postSeriesRequests(W0);
    await postSeriesRequests(new Date(W1.getTime() - 31 * MINUTE));
    expect(await scrimsOf(seriesId)).toHaveLength(1);
    expect(await seriesOf(seriesId)).toMatchObject({ nextStartsAt: W1 });
    // Too late for W1: the partnership moves on to W2.
    await postSeriesRequests(new Date(W1.getTime() - 29 * MINUTE));
    expect(await seriesOf(seriesId)).toMatchObject({ nextStartsAt: W2, endedAt: null });
    await prisma.user.update({ where: { id: b.captain.id }, data: { verifiedAt: NOW } });
    await postSeriesRequests(W1);
    expect((await scrimsOf(seriesId)).map(({ startsAt }) => startsAt)).toEqual([W0, W2]);
  });

  it("books only the next possible date after a sweeper outage", async () => {
    const { seriesId } = await partnership();
    await postSeriesRequests(new Date(W2.getTime() + HOUR));
    expect((await scrimsOf(seriesId)).map(({ startsAt }) => startsAt)).toEqual([W0, W3]);
    expect(await seriesOf(seriesId)).toMatchObject({ nextStartsAt: W4, endedAt: null });
  });

  it("keeps running when one date is cancelled", async () => {
    const { b, seriesId } = await partnership();
    await postSeriesRequests(W0);
    const [, next] = await scrimsOf(seriesId);
    await cancelScrim({ userId: b.captain.id, teamId: b.team.id, scrimId: next!.id, now: W0 });
    await postSeriesRequests(W1);
    expect((await scrimsOf(seriesId)).map(({ startsAt, status }) => [startsAt, status])).toEqual([
      [W0, ScrimStatus.SCHEDULED],
      [W1, ScrimStatus.CANCELLED],
      [W2, ScrimStatus.SCHEDULED],
    ]);
  });

  it("is ended by either captain, the other team notified, booked dates kept", async () => {
    for (const side of ["a", "b"] as const) {
      const { a, b, scrim, seriesId } = await partnership();
      const [ending, other] = side === "a" ? [a, b] : [b, a];
      await expect(
        endRequestSeries({ userId: other.members[0]!.id, seriesId, now: NOW }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await endRequestSeries({ userId: ending.captain.id, seriesId, now: NOW });
      expect(await seriesOf(seriesId)).toMatchObject({ endedAt: NOW });
      const [ended] = await notificationsTo(other.team.id, NotifType.PARTNERSHIP_ENDED);
      expect(ended).toMatchObject({
        dedupeKey: `PARTNERSHIP_ENDED:${seriesId}:${other.team.id}:PERSONAL`,
        payload: { teamName: ending.team.name, startsAt: W1.toISOString() },
      });
      expect(await notificationsTo(ending.team.id, NotifType.PARTNERSHIP_ENDED)).toEqual([]);
      expect(await prisma.scrim.findUniqueOrThrow({ where: { id: scrim.id } })).toMatchObject({
        status: ScrimStatus.SCHEDULED,
      });
      await expect(
        endRequestSeries({ userId: other.captain.id, seriesId, now: NOW }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await postSeriesRequests(W0);
      expect(await scrimsOf(seriesId)).toHaveLength(1);
    }
  });

  it("is shown to both teams, with the partner and the reason a date waits", async () => {
    const { a, b, seriesId } = await partnership();
    const seriesFor = async (userId: string, now = NOW) =>
      (await getMyScrims({ userId, now })).series.find(({ id }) => id === seriesId);
    expect(await seriesFor(a.captain.id)).toMatchObject({
      partner: { id: b.team.id, name: b.team.name },
      nextStartsAt: W1,
      postsAt: W0,
      due: false,
      blocked: null,
      end: { problem: null },
    });
    expect(await seriesFor(b.captain.id)).toMatchObject({
      partner: { id: a.team.id },
      end: { problem: null },
    });
    expect(await seriesFor(b.members[0]!.id)).toMatchObject({ end: null });

    await prisma.user.update({ where: { id: b.captain.id }, data: { verifiedAt: null } });
    expect(await seriesFor(a.captain.id, W0)).toMatchObject({
      due: true,
      blocked: "PARTNER_CAPTAIN_NOT_VERIFIED",
    });
    expect(await seriesFor(b.members[0]!.id, W0)).toMatchObject({
      blocked: "CAPTAIN_NOT_VERIFIED",
    });
  });
});

describe("bans and dissolutions", () => {
  it("drops direct requests to a banned team silently and ends its partnerships", async () => {
    const { a, b, seriesId } = await partnership();
    const request = await sendDirect(a, b.team, { date: "2026-12-01" });
    await banTeam({ adminId: admin.id, teamId: b.team.id, now: NOW });
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.CANCELLED });
    expect(await notificationsTo(a.team.id, NotifType.REQUEST_DELETED)).toEqual([]);
    expect(await seriesOf(seriesId)).toMatchObject({ endedAt: NOW });
    expect((await scrimsOf(seriesId))[0]).toMatchObject({ status: ScrimStatus.CANCELLED });
  });

  it("tells the requested team when the requesting team is dissolved", async () => {
    const { a, b, seriesId } = await partnership();
    const request = await sendDirect(a, b.team, { date: "2026-12-01" });
    await dissolveTeam(a.team.id, NOW);
    expect(
      await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: RequestStatus.CANCELLED });
    const [deleted] = await notificationsTo(b.team.id, NotifType.REQUEST_DELETED);
    expect(deleted).toMatchObject({ requestId: request.id, payload: { direct: true } });
    expect(await seriesOf(seriesId)).toMatchObject({ endedAt: NOW });
  });
});

describe("reads for the entry points", () => {
  it("lists outgoing and incoming direct requests in the requests tab", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createTeamWithMembers({ extraMembers: 1 });
    const request = await sendDirect(a, b.team, { repeatUntil: UNTIL_W4 });
    expect((await getMyScrims({ userId: a.captain.id, now: NOW })).requests).toEqual([
      expect.objectContaining({
        id: request.id,
        target: expect.objectContaining({ id: b.team.id, name: b.team.name }),
        weeklyUntil: W4,
      }),
    ]);
    expect((await getMyScrims({ userId: b.members[0]!.id, now: NOW })).incoming).toEqual([
      expect.objectContaining({
        id: request.id,
        startsAt: W0,
        weeklyUntil: W4,
        team: expect.objectContaining({ id: a.team.id }),
      }),
    ]);
  });

  it("offers a rematch for past scrims to the captain while the opponent is active", async () => {
    const { host, guest, scrim } = await bookScrim();
    const after = new Date(W0.getTime() + HOUR);
    const detail = (userId: string, now: Date) =>
      getScrimDetail({ userId, scrimId: scrim.id, now });
    expect(await detail(host.captain.id, NOW)).toMatchObject({ rematch: false });
    expect(await detail(host.captain.id, after)).toMatchObject({ rematch: true });
    expect(await detail(host.members[0]!.id, after)).toMatchObject({ rematch: false });
    const past = (await getMyScrims({ userId: guest.captain.id, now: after })).past;
    expect(past.find(({ id }) => id === scrim.id)).toMatchObject({ rematch: true });
    await banTeam({ adminId: admin.id, teamId: guest.team.id, now: after });
    expect(await detail(host.captain.id, after)).toMatchObject({ rematch: false });
  });

  it("offers a direct request on the other teams of the list to the captain", async () => {
    const a = await createTeamWithMembers({ extraMembers: 1 });
    const b = await createTeamWithMembers();
    const entries = async (userId: string) =>
      new Map(
        (await getTeamList({ userId, now: NOW })).teams.map((team) => [team.id, team.canRequest]),
      );
    const captainView = await entries(a.captain.id);
    expect(captainView.get(b.team.id)).toBe(true);
    expect(captainView.get(a.team.id)).toBe(false);
    expect((await entries(a.members[0]!.id)).get(b.team.id)).toBe(false);
  });

  it("names the requested team and the partner in the data export", async () => {
    const { a, b } = await partnership();
    await sendDirect(a, b.team, { date: "2026-12-01" });
    const data = await exportAccountData({
      userId: a.captain.id,
      now: NOW,
      privacyPolicyUrl: "https://uniscrims.test/datenschutz",
      uploadDir: "/nonexistent",
    });
    // Both were created at NOW, so their order is not fixed.
    expect(data.anfragen).toHaveLength(2);
    expect(data.anfragen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ direktAn: b.team.name, wöchentlichBis: W4, status: "Gebucht" }),
        expect.objectContaining({ direktAn: b.team.name, wöchentlichBis: null, status: "Offen" }),
      ]),
    );
    expect(data.wiederkehrendeAnfragen).toEqual([
      expect.objectContaining({ festerPartner: b.team.name }),
    ]);
  });
});
