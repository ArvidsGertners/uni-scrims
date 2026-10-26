// "Heute spielbereit" (SPEC N-27, ARCHITECTURE §5.29). NOW is Wed 21.10.2026, 14:00 Berlin (summer
// time), so this evening offers start times from 14:30 to 01:45. The test DB is shared by all files,
// so the board checks only look at this file's windows.
import {
  NotifChannel,
  NotifType,
  Rank,
  RequestStatus,
  ScrimFormat,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { describe, expect, it } from "vitest";
import {
  type ReadyWindowInput,
  acceptDirectRequest,
  banTeam,
  createReadyWindow,
  declineDirectRequest,
  deleteRequest,
  dissolveTeam,
  endReadyWindow,
  expireRequests,
  exportAccountData,
  getBoard,
  getMyScrims,
  getPublicBoard,
  getPublicTeamLogo,
  getReadyWindowForm,
  getRequestDetail,
  readyWindowStartOptions,
  readyWindowStarts,
  requestReadyWindow,
} from "../src/index.ts";
import { parseNotificationPayload } from "../src/notifications.ts";
import {
  NOW,
  createFullyVerifiedTeam,
  createOpenRequest,
  createTeamWithMembers,
  useAdmin,
} from "./helpers.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** 19:00 to 22:00 Berlin this evening. */
const WINDOW: ReadyWindowInput = {
  from: "19:00",
  to: "22:00",
  format: ScrimFormat.BO3,
  rankMin: Rank.SILVER,
  rankMax: Rank.PLATINUM,
  maps: ["Ascent", "Bind"],
};
const FIRST = new Date("2026-10-21T17:00:00Z");
const LAST = new Date("2026-10-21T20:00:00Z");
/** 20:00 Berlin, inside the window. */
const TWENTY = new Date("2026-10-21T18:00:00Z");

const admin = useAdmin();

type Team = Awaited<ReturnType<typeof createTeamWithMembers>>;

/** This evening, as the form sends it back with its times. */
const EVENING = "2026-10-21";

async function announce(team: Team, overrides: Partial<typeof WINDOW> = {}, now = NOW) {
  return createReadyWindow({
    ...WINDOW,
    ...overrides,
    userId: team.captain.id,
    teamId: team.team.id,
    evening: EVENING,
    now,
  });
}

async function requestFor(
  from: Team,
  window: { id: string },
  startsAt: Date = TWENTY,
  now: Date = NOW,
) {
  return requestReadyWindow({
    userId: from.captain.id,
    teamId: from.team.id,
    windowId: window.id,
    startsAt,
    now,
  });
}

/** The windows of `ids` on a board, to ignore those of other test files. */
function windowsOf<T extends { id: string }>(board: { readyWindows: T[] }, ...ids: string[]) {
  return board.readyWindows.filter((window) => ids.includes(window.id));
}

async function personalTo(teamId: string, type: NotifType) {
  return prisma.notification.findMany({
    where: { targetTeamId: teamId, type, channel: NotifChannel.PERSONAL },
  });
}

describe("readyWindowStarts", () => {
  it("offers this evening's start times with the lead time", () => {
    const starts = readyWindowStarts(NOW);
    expect(starts[0]).toEqual(new Date("2026-10-21T12:30:00Z"));
    expect(starts.at(-1)).toEqual(new Date("2026-10-21T23:45:00Z"));
  });

  it("keeps the evening after midnight and has none left after 01:45", () => {
    // 00:30 Berlin on Thursday still belongs to Wednesday's evening.
    expect(readyWindowStarts(new Date("2026-10-21T22:30:00Z"))).toEqual([
      new Date("2026-10-21T23:00:00Z"),
      new Date("2026-10-21T23:15:00Z"),
      new Date("2026-10-21T23:30:00Z"),
      new Date("2026-10-21T23:45:00Z"),
    ]);
    expect(readyWindowStarts(new Date("2026-10-21T23:20:00Z"))).toEqual([]);
  });

  it("offers the new day from 10:00 at night", () => {
    // 03:00 Berlin on Thursday.
    const starts = readyWindowStarts(new Date("2026-10-22T01:00:00Z"));
    expect(starts[0]).toEqual(new Date("2026-10-22T08:00:00Z"));
    expect(starts).toHaveLength(64);
  });
});

describe("createReadyWindow", () => {
  it("announces the team for this evening, outside the request limit", async () => {
    const a = await createFullyVerifiedTeam();
    for (const date of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) {
      await createOpenRequest(a.captain.id, { date });
    }
    const window = await announce(a);
    expect(window).toMatchObject({
      teamId: a.team.id,
      createdById: a.captain.id,
      firstStartsAt: FIRST,
      lastStartsAt: LAST,
      format: ScrimFormat.BO3,
      rankMin: Rank.SILVER,
      rankMax: Rank.PLATINUM,
      maps: ["Ascent", "Bind"],
      endedAt: null,
      createdAt: NOW,
    });
  });

  it("allows a single start time and one after midnight", async () => {
    const a = await createFullyVerifiedTeam();
    const window = await announce(a, { from: "00:30", to: "00:30" });
    expect(window.firstStartsAt).toEqual(new Date("2026-10-21T22:30:00Z"));
    expect(window.lastStartsAt).toEqual(window.firstStartsAt);
  });

  it("refuses members, unverified captains and banned teams", async () => {
    const a = await createFullyVerifiedTeam();
    await expect(
      createReadyWindow({
        ...WINDOW,
        userId: a.members[0]!.id,
        teamId: a.team.id,
        evening: EVENING,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const unverified = await createTeamWithMembers({ verifiedCaptain: false });
    await expect(announce(unverified)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    const banned = await createTeamWithMembers({ banned: true });
    await expect(announce(banned)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses times too soon, off the grid or in the wrong order", async () => {
    const a = await createFullyVerifiedTeam();
    await expect(announce(a, { from: "14:15" })).rejects.toMatchObject({
      code: "INVALID",
      text: { key: "readyWindowTimeInvalid", params: { minutes: 30 } },
    });
    await expect(announce(a, { to: "03:00" })).rejects.toMatchObject({
      text: { key: "timeOutOfRange" },
    });
    await expect(announce(a, { from: "22:00", to: "19:00" })).rejects.toMatchObject({
      text: { key: "readyWindowOrder" },
    });
    await expect(announce(a, { rankMin: Rank.GOLD, rankMax: Rank.IRON })).rejects.toMatchObject({
      text: { key: "rankMinAboveMax" },
    });
    expect(await announce(a, { from: "14:30", to: "14:30" })).toMatchObject({
      firstStartsAt: new Date("2026-10-21T12:30:00Z"),
    });
  });

  it("refuses times of an evening that has passed since the form was shown", async () => {
    const a = await createFullyVerifiedTeam();
    // Shown on Thursday at 01:10 for Wednesday's evening, sent at 02:05: 01:45 would be Friday's.
    const sent = new Date("2026-10-22T00:05:00Z");
    await expect(announce(a, { from: "01:45", to: "01:45" }, sent)).rejects.toMatchObject({
      code: "INVALID",
      text: { key: "readyWindowTimeInvalid" },
    });
    expect(
      await createReadyWindow({
        ...WINDOW,
        userId: a.captain.id,
        teamId: a.team.id,
        evening: "2026-10-22",
        now: sent,
      }),
    ).toMatchObject({ firstStartsAt: new Date("2026-10-22T17:00:00Z") });
  });

  it("keeps one running window per team, a new one after the end or expiry", async () => {
    const a = await createFullyVerifiedTeam();
    const first = await announce(a);
    await expect(announce(a, { from: "23:00", to: "23:00" })).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "readyWindowExists" },
    });
    await endReadyWindow({ userId: a.captain.id, windowId: first.id, now: NOW });
    const second = await announce(a, { from: "15:00", to: "15:00" });
    // 14:31 Berlin: 15:00 is less than 30 minutes ahead, so the window has run out.
    const later = new Date(NOW.getTime() + 31 * MINUTE);
    expect(await announce(a, { from: "20:00", to: "21:00" }, later)).toMatchObject({
      firstStartsAt: TWENTY,
    });
    expect(second.endedAt).toBeNull();
  });
});

describe("the board", () => {
  it("shows other teams' windows with their start times, the own one on top", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    const board = await getBoard({ userId: b.captain.id, now: NOW });
    const [card] = windowsOf(board, window.id);
    expect(card).toMatchObject({
      lastStartsAt: LAST,
      format: ScrimFormat.BO3,
      rankMin: Rank.SILVER,
      rankMax: Rank.PLATINUM,
      maps: ["Ascent", "Bind"],
      team: { id: a.team.id, name: a.team.name, fullyVerified: true },
      ownRequest: null,
      request: { problem: null },
    });
    expect(card!.startOptions).toHaveLength(13);
    expect(card!.startOptions[0]).toEqual(FIRST);
    expect(board.ownReadyWindow).toBeNull();

    const own = await getBoard({ userId: a.captain.id, now: NOW });
    expect(windowsOf(own, window.id)).toEqual([]);
    expect(own.ownReadyWindow).toMatchObject({
      id: window.id,
      firstStartsAt: FIRST,
      lastStartsAt: LAST,
      openRequestCount: 0,
      end: { problem: null },
    });
    const member = await getBoard({ userId: a.members[0]!.id, now: NOW });
    expect(member.ownReadyWindow).toMatchObject({ id: window.id, end: null });
  });

  it("names why a member or an unverified captain cannot request", async () => {
    const a = await createFullyVerifiedTeam();
    const window = await announce(a);
    const b = await createFullyVerifiedTeam();
    const unverified = await createTeamWithMembers({ verifiedCaptain: false });
    const forMember = await getBoard({ userId: b.members[0]!.id, now: NOW });
    expect(windowsOf(forMember, window.id)[0]!.request).toEqual({
      problem: { key: "notCaptain" },
    });
    const forUnverified = await getBoard({ userId: unverified.captain.id, now: NOW });
    expect(windowsOf(forUnverified, window.id)[0]!.request).toEqual({
      problem: { key: "captainNotVerified" },
    });
  });

  it("drops start times too soon and the window once none is left", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    // 18:45 Berlin: 19:00 and 19:15 are too soon.
    const evening = new Date("2026-10-21T16:45:00Z");
    const [card] = windowsOf(await getBoard({ userId: b.captain.id, now: evening }), window.id);
    expect(card!.startOptions[0]).toEqual(new Date("2026-10-21T17:15:00Z"));
    // 21:31 Berlin: not even 22:00 is left.
    const late = new Date("2026-10-21T19:31:00Z");
    expect(windowsOf(await getBoard({ userId: b.captain.id, now: late }), window.id)).toEqual([]);
    expect((await getBoard({ userId: a.captain.id, now: late })).ownReadyWindow).toBeNull();
  });

  it("filters like the board: rank, badge, reliability and day", async () => {
    const a = await createTeamWithMembers();
    const viewer = await createFullyVerifiedTeam();
    const window = await announce(a, { from: "23:00", to: "01:00" });
    const board = (filter: Partial<Parameters<typeof getBoard>[0]>) =>
      getBoard({ userId: viewer.captain.id, now: NOW, ...filter }).then((result) =>
        windowsOf(result, window.id),
      );
    // The viewer's team rank is Gold, inside Silver to Platinum.
    expect(await board({})).toHaveLength(1);
    expect(await board({ ranks: [Rank.IRON] })).toEqual([]);
    expect(await board({ ranks: [Rank.IRON, Rank.PLATINUM] })).toHaveLength(1);
    expect(await board({ fullyVerifiedOnly: true })).toEqual([]);
    // Without scrims a team counts as reliable (SPEC N-23).
    expect(await board({ reliableOnly: true })).toHaveLength(1);
    // 23:00 is on Wednesday, 00:00 to 01:00 on Thursday.
    expect(await board({ date: "2026-10-21" })).toHaveLength(1);
    expect(await board({ date: "2026-10-22" })).toHaveLength(1);
    expect(await board({ date: "2026-10-23" })).toEqual([]);
    // At 23:40 Berlin only Thursday's start times are left.
    const late = new Date("2026-10-21T21:40:00Z");
    const lateBoard = await getBoard({ userId: viewer.captain.id, now: late, date: "2026-10-21" });
    expect(windowsOf(lateBoard, window.id)).toEqual([]);
  });

  it("leaves out banned and dissolved teams and ended windows", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createTeamWithMembers();
    const c = await createFullyVerifiedTeam();
    const viewer = await createFullyVerifiedTeam();
    const [wa, wb, wc] = [await announce(a), await announce(b), await announce(c)];
    await banTeam({ adminId: admin.id, teamId: a.team.id, now: NOW });
    await dissolveTeam(b.team.id, NOW);
    await endReadyWindow({ userId: c.captain.id, windowId: wc.id, now: NOW });
    const board = await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW });
    expect(windowsOf(board, wa.id, wb.id, wc.id)).toEqual([]);
    const ended = await prisma.readyWindow.findMany({ where: { id: { in: [wa.id, wb.id] } } });
    expect(ended.map((window) => window.endedAt)).toEqual([NOW, NOW]);
  });

  it("stands on the public board, and the team's logo is public meanwhile", async () => {
    const a = await createFullyVerifiedTeam();
    await prisma.teamLogo.create({
      data: { teamId: a.team.id, background: "DARK", data: new Uint8Array([1, 2, 3]) },
    });
    await prisma.team.update({ where: { id: a.team.id }, data: { logoUpdatedAt: NOW } });
    const logo = () => getPublicTeamLogo({ teamId: a.team.id, background: "DARK", now: NOW });
    await expect(logo()).rejects.toMatchObject({ code: "NOT_FOUND" });
    const window = await announce(a);
    const board = await getPublicBoard({ now: NOW });
    expect(windowsOf(board, window.id)).toEqual([
      expect.objectContaining({ id: window.id, team: expect.objectContaining({ id: a.team.id }) }),
    ]);
    expect(windowsOf(board, window.id)[0]).not.toHaveProperty("request");
    await expect(logo()).resolves.toMatchObject({ data: new Uint8Array([1, 2, 3]) });
    await endReadyWindow({ userId: a.captain.id, windowId: window.id, now: NOW });
    await expect(logo()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("requestReadyWindow", () => {
  it("sends a direct request with the window's format and maps, not on the board", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const viewer = await createFullyVerifiedTeam();
    const window = await announce(a);
    const request = await requestFor(b, window);
    expect(request).toMatchObject({
      teamId: b.team.id,
      targetTeamId: a.team.id,
      readyWindowId: window.id,
      startsAt: TWENTY,
      format: ScrimFormat.BO3,
      maps: ["Ascent", "Bind"],
      rankMin: Rank.IRON,
      rankMax: Rank.RADIANT,
      note: null,
      weeklyLastStartsAt: null,
      status: RequestStatus.OPEN,
    });
    const [notice] = await personalTo(a.team.id, NotifType.DIRECT_REQUEST_RECEIVED);
    expect(notice?.payload).toEqual({
      teamName: b.team.name,
      startsAt: TWENTY.toISOString(),
      format: ScrimFormat.BO3,
      weeklyUntil: null,
      readyWindow: true,
    });
    const board = await getBoard({ userId: viewer.captain.id, ranks: "ALL", now: NOW });
    expect(board.requests.map(({ id }) => id)).not.toContain(request.id);
    const [card] = windowsOf(await getBoard({ userId: b.captain.id, now: NOW }), window.id);
    expect(card).toMatchObject({
      ownRequest: { id: request.id, status: RequestStatus.OPEN, open: true },
      request: null,
    });
    expect(
      (await getBoard({ userId: a.captain.id, now: NOW })).ownReadyWindow?.openRequestCount,
    ).toBe(1);
  });

  it("refuses start times outside the window, off the grid or too soon", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    await expect(
      requestFor(b, window, new Date(FIRST.getTime() - 15 * MINUTE)),
    ).rejects.toMatchObject({ code: "INVALID", text: { key: "startOutsideWindow" } });
    await expect(
      requestFor(b, window, new Date(LAST.getTime() + 15 * MINUTE)),
    ).rejects.toMatchObject({ text: { key: "startOutsideWindow" } });
    await expect(
      requestFor(b, window, new Date(TWENTY.getTime() + 7 * MINUTE)),
    ).rejects.toMatchObject({ text: { key: "timeOutOfRange" } });
    await expect(requestFor(b, window, new Date("invalid"))).rejects.toMatchObject({
      code: "INVALID",
    });
    // 18:45 Berlin: 19:00 is too soon.
    await expect(
      requestFor(b, window, FIRST, new Date("2026-10-21T16:45:00Z")),
    ).rejects.toMatchObject({ text: { key: "startTooSoon" } });
    await expect(
      requestReadyWindow({
        userId: b.captain.id,
        teamId: b.team.id,
        windowId: "no-such-window",
        startsAt: TWENTY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", text: { key: "readyWindowNotFound" } });
  });

  it("lets a team request a window once, also after a decline or withdrawal", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const c = await createFullyVerifiedTeam();
    const window = await announce(a);
    const fromB = await requestFor(b, window);
    await expect(requestFor(b, window, FIRST)).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "alreadyRequestedWindow" },
    });
    await declineDirectRequest({ userId: a.captain.id, requestId: fromB.id, now: NOW });
    await expect(requestFor(b, window, FIRST)).rejects.toMatchObject({
      text: { key: "alreadyRequestedWindow" },
    });
    const fromC = await requestFor(c, window);
    await deleteRequest({ userId: c.captain.id, requestId: fromC.id, now: NOW });
    await expect(requestFor(c, window, FIRST)).rejects.toMatchObject({
      text: { key: "alreadyRequestedWindow" },
    });
    // A decline keeps the window running, without the note of a closed window.
    const [declined] = await personalTo(b.team.id, NotifType.DIRECT_REQUEST_DECLINED);
    expect(declined?.payload).toEqual({ teamName: a.team.name, startsAt: TWENTY.toISOString() });
    expect((await prisma.readyWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt).toBe(
      null,
    );
    const [card] = windowsOf(await getBoard({ userId: b.captain.id, now: NOW }), window.id);
    expect(card?.ownRequest).toMatchObject({ status: RequestStatus.DECLINED, open: false });
  });

  it("counts to the requesting team's limit and follows the direct request rules", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    for (const date of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) {
      await createOpenRequest(b.captain.id, { date });
    }
    await expect(requestFor(b, window)).rejects.toMatchObject({ text: { key: "requestLimit" } });
    await expect(requestFor(a, window)).rejects.toMatchObject({ text: { key: "ownTeamTarget" } });
    const unverified = await createTeamWithMembers({ verifiedCaptain: false });
    await expect(requestFor(unverified, window)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    // The window team admits only fully verified applicants: not for direct requests (§5.28).
    await prisma.team.update({ where: { id: a.team.id }, data: { verifiedApplicantsOnly: true } });
    const small = await createTeamWithMembers();
    await expect(requestFor(small, window)).resolves.toMatchObject({ targetTeamId: a.team.id });
  });

  it("refuses an ended window", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    await endReadyWindow({ userId: a.captain.id, windowId: window.id, now: NOW });
    await expect(requestFor(b, window)).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "readyWindowClosed" },
    });
  });
});

describe("accepting and ending", () => {
  it("accepting one books the scrim, ends the window and declines the others", async () => {
    const a = await createFullyVerifiedTeam();
    const [b, c, d] = [
      await createFullyVerifiedTeam(),
      await createFullyVerifiedTeam(),
      await createFullyVerifiedTeam(),
    ];
    const window = await announce(a);
    const fromB = await requestFor(b, window);
    const fromC = await requestFor(c, window, FIRST);
    const fromD = await requestFor(d, window, LAST);
    await deleteRequest({ userId: d.captain.id, requestId: fromD.id, now: NOW });
    const scrim = await acceptDirectRequest({
      userId: a.captain.id,
      requestId: fromB.id,
      now: NOW,
    });
    expect(scrim).toMatchObject({
      hostTeamId: b.team.id,
      guestTeamId: a.team.id,
      startsAt: TWENTY,
      format: ScrimFormat.BO3,
      status: ScrimStatus.SCHEDULED,
    });
    const after = await prisma.scrimRequest.findMany({
      where: { id: { in: [fromB.id, fromC.id, fromD.id] } },
      orderBy: { startsAt: "asc" },
    });
    expect(after.map((request) => request.status)).toEqual([
      RequestStatus.DECLINED,
      RequestStatus.BOOKED,
      RequestStatus.CANCELLED,
    ]);
    expect(
      (await prisma.readyWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt,
    ).toEqual(NOW);
    const [declined] = await personalTo(c.team.id, NotifType.DIRECT_REQUEST_DECLINED);
    expect(declined?.payload).toEqual({
      teamName: a.team.name,
      startsAt: FIRST.toISOString(),
      readyWindow: "BOOKED",
    });
    // The sender parses the payloads before building a message (§6.2).
    expect(parseNotificationPayload(NotifType.DIRECT_REQUEST_DECLINED, declined!.payload)).toEqual(
      declined!.payload,
    );
    const [received] = await personalTo(a.team.id, NotifType.DIRECT_REQUEST_RECEIVED);
    expect(
      parseNotificationPayload(NotifType.DIRECT_REQUEST_RECEIVED, received!.payload),
    ).toMatchObject({ readyWindow: true });
    expect(await personalTo(d.team.id, NotifType.DIRECT_REQUEST_DECLINED)).toEqual([]);
    expect(await personalTo(b.team.id, NotifType.SCRIM_BOOKED)).toHaveLength(1);
    expect(windowsOf(await getBoard({ userId: c.captain.id, now: NOW }), window.id)).toEqual([]);
    // The other open request was declined, so a second acceptance has nothing left.
    await expect(
      acceptDirectRequest({ userId: a.captain.id, requestId: fromC.id, now: NOW }),
    ).rejects.toMatchObject({ text: { key: "requestNotOpen" } });
  });

  it("accepting from a run-out window also closes a newer one of the team", async () => {
    const a = await createFullyVerifiedTeam();
    const [b, c] = [await createFullyVerifiedTeam(), await createFullyVerifiedTeam()];
    const old = await announce(a, { from: "15:00", to: "15:00" });
    const fromB = await requestFor(b, old, new Date("2026-10-21T13:00:00Z"));
    // 14:31 Berlin: 15:00 is too soon, the window has run out, but B's request is still open.
    const later = new Date(NOW.getTime() + 31 * MINUTE);
    const newer = await announce(a, {}, later);
    const fromC = await requestFor(c, newer, TWENTY, later);
    await acceptDirectRequest({ userId: a.captain.id, requestId: fromB.id, now: later });
    const windows = await prisma.readyWindow.findMany({ where: { teamId: a.team.id } });
    expect(windows.map((window) => window.endedAt)).toEqual([later, later]);
    expect((await prisma.scrimRequest.findUniqueOrThrow({ where: { id: fromC.id } })).status).toBe(
      RequestStatus.DECLINED,
    );
    const [declined] = await personalTo(c.team.id, NotifType.DIRECT_REQUEST_DECLINED);
    expect(declined?.payload).toMatchObject({ readyWindow: "BOOKED" });
  });

  it("lets the captain end the window, declining its open requests", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    const fromB = await requestFor(b, window);
    const end = (userId: string) => endReadyWindow({ userId, windowId: window.id, now: NOW });
    await expect(end(a.members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(end(b.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await end(a.captain.id);
    expect((await prisma.scrimRequest.findUniqueOrThrow({ where: { id: fromB.id } })).status).toBe(
      RequestStatus.DECLINED,
    );
    const [declined] = await personalTo(b.team.id, NotifType.DIRECT_REQUEST_DECLINED);
    expect(declined?.payload).toMatchObject({ readyWindow: "ENDED" });
    await expect(end(a.captain.id)).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "readyWindowClosed" },
    });
    await expect(
      endReadyWindow({ userId: a.captain.id, windowId: "no-such-window", now: NOW }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a ban of the requesting team withdraws its request, the window runs on", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    const fromB = await requestFor(b, window);
    await banTeam({ adminId: admin.id, teamId: b.team.id, now: NOW });
    expect((await prisma.scrimRequest.findUniqueOrThrow({ where: { id: fromB.id } })).status).toBe(
      RequestStatus.CANCELLED,
    );
    const [deleted] = await personalTo(a.team.id, NotifType.REQUEST_DELETED);
    expect(deleted?.payload).toMatchObject({ direct: true });
    expect((await prisma.readyWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt).toBe(
      null,
    );
  });

  it("a ban of the window team ends it, its requests fall away without a notice", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    const fromB = await requestFor(b, window);
    await banTeam({ adminId: admin.id, teamId: a.team.id, now: NOW });
    expect((await prisma.scrimRequest.findUniqueOrThrow({ where: { id: fromB.id } })).status).toBe(
      RequestStatus.CANCELLED,
    );
    expect(
      (await prisma.readyWindow.findUniqueOrThrow({ where: { id: window.id } })).endedAt,
    ).toEqual(NOW);
    expect(await personalTo(b.team.id, NotifType.DIRECT_REQUEST_DECLINED)).toEqual([]);
    expect(await personalTo(b.team.id, NotifType.REQUEST_DELETED)).toEqual([]);
  });

  it("lets unanswered requests expire at their start like any direct request", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    const fromB = await requestFor(b, window, FIRST);
    await expireRequests(new Date(FIRST.getTime() + MINUTE));
    expect((await prisma.scrimRequest.findUniqueOrThrow({ where: { id: fromB.id } })).status).toBe(
      RequestStatus.EXPIRED,
    );
    expect(await personalTo(b.team.id, NotifType.REQUEST_EXPIRED)).toEqual([]);
  });
});

describe("reads", () => {
  it("marks requests from a window on both sides", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    const request = await requestFor(b, window);
    const incoming = (await getMyScrims({ userId: a.captain.id, now: NOW })).incoming;
    expect(incoming).toEqual([expect.objectContaining({ id: request.id, readyWindow: true })]);
    const own = (await getMyScrims({ userId: b.captain.id, now: NOW })).requests;
    expect(own).toEqual([expect.objectContaining({ id: request.id, readyWindow: true })]);
    const detail = await getRequestDetail({
      userId: a.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(detail?.direct).toMatchObject({ incoming: true, readyWindow: true });
  });

  it("gives the form its start times, the running window and the reasons", async () => {
    const a = await createFullyVerifiedTeam({ rank: Rank.DIAMOND });
    const form = await getReadyWindowForm({ userId: a.captain.id, now: NOW });
    expect(form).toMatchObject({
      teamId: a.team.id,
      teamName: a.team.name,
      rankRange: { rankMin: Rank.DIAMOND, rankMax: Rank.DIAMOND },
      running: null,
      problems: [],
    });
    expect(form!.starts).toEqual(readyWindowStarts(NOW));
    expect(form!.evening).toBe(EVENING);
    const window = await announce(a);
    expect((await getReadyWindowForm({ userId: a.captain.id, now: NOW }))?.running).toEqual({
      id: window.id,
      firstStartsAt: FIRST,
      lastStartsAt: LAST,
    });
    expect((await getReadyWindowForm({ userId: a.members[0]!.id, now: NOW }))?.problems).toEqual([
      expect.objectContaining({ kind: "NOT_CAPTAIN" }),
    ]);
    const unverified = await createTeamWithMembers({ verifiedCaptain: false });
    expect(
      (await getReadyWindowForm({ userId: unverified.captain.id, now: NOW }))?.problems,
    ).toEqual([expect.objectContaining({ kind: "CAPTAIN_NOT_VERIFIED" })]);
    const late = await getReadyWindowForm({
      userId: a.captain.id,
      now: new Date("2026-10-21T23:20:00Z"),
    });
    expect(late?.starts).toEqual([]);
  });

  it("lists the start times still to request of a window", () => {
    const window = { firstStartsAt: FIRST, lastStartsAt: new Date(FIRST.getTime() + HOUR) };
    expect(readyWindowStartOptions(window, NOW)).toHaveLength(5);
    expect(readyWindowStartOptions(window, new Date(FIRST.getTime() - 20 * MINUTE))).toEqual([
      new Date(FIRST.getTime() + 15 * MINUTE),
      new Date(FIRST.getTime() + 30 * MINUTE),
      new Date(FIRST.getTime() + 45 * MINUTE),
      new Date(FIRST.getTime() + HOUR),
    ]);
  });

  it("puts windows and requests from them into the account export", async () => {
    const a = await createFullyVerifiedTeam();
    const b = await createFullyVerifiedTeam();
    const window = await announce(a);
    await requestFor(b, window);
    const exportOf = (userId: string) =>
      exportAccountData({
        userId,
        now: NOW,
        privacyPolicyUrl: "https://uniscrims.test/datenschutz",
        uploadDir: "/nonexistent",
      });
    expect((await exportOf(a.captain.id)).heuteSpielbereit).toEqual([
      {
        team: a.team.name,
        gemeldetAm: NOW,
        frühesterStartAm: FIRST,
        spätesterStartAm: LAST,
        format: "BO3",
        rangVon: "Silver",
        rangBis: "Platinum",
        maps: ["Ascent", "Bind"],
        beendetAm: null,
      },
    ]);
    expect((await exportOf(b.captain.id)).anfragen).toEqual([
      expect.objectContaining({ direktAn: a.team.name, ausZeitfenster: true }),
    ]);
  });
});
