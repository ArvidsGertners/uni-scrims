import { prisma } from "@uni-scrims/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  type OplApi,
  OplError,
  type OplTournament,
  UNILIGA_ROOT_LIMIT,
  chosenLeagues,
  createOplClient,
  getMyTeam,
  getPublicBoard,
  getTeamList,
  getUniligaLeagues,
  oplTick,
  parseLeague,
  uniligaTick,
} from "../src/index.ts";
import { NOW, createOpenRequest, createTeamWithMembers, createUser } from "./helpers.ts";

// Phase 40 (SPEC N-36, §5.38): the Uniliga league from OPL, its run, badge and filter.

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.oplCrawl.deleteMany();
});

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const RATE = { remaining: 99, resetSec: 30 };

// OPL team IDs are unique on Team, and the database is only reset once per run.
let lastOplId = 300_000_000 + Math.floor(Math.random() * 100_000_000);
function oplId(): number {
  return ++lastOplId;
}

const WINTER = "Uniliga VALORANT Winterseason 2026/27";
const SUMMER = "Uniliga VALORANT Sommerseason 2026";

type Registrations = { name: string; teamIds: number[] };

/** OPL in memory: the Uniliga's tournaments and the registrations of its leaves; counts calls. */
function fakeOpl() {
  const organiser: { ids: number[] | "gone" } = { ids: [] };
  const tournaments = new Map<number, OplTournament>();
  const registrations = new Map<number, Registrations>();
  const failing: { error: OplError | null; times: number } = { error: null, times: 0 };
  const calls: string[] = [];
  function fail() {
    if (failing.error && failing.times > 0) {
      failing.times--;
      throw failing.error;
    }
  }
  const api: OplApi = {
    async user() {
      calls.push("user");
      return { result: { kind: "gone" }, rateLimit: RATE };
    },
    async teamRoster() {
      calls.push("teamRoster");
      return { result: { kind: "gone" }, rateLimit: RATE };
    },
    async organiserTournaments() {
      calls.push("organiser");
      fail();
      if (organiser.ids === "gone") return { result: { kind: "gone" }, rateLimit: RATE };
      return { result: { kind: "found", tournamentIds: organiser.ids }, rateLimit: RATE };
    },
    async tournament(id) {
      calls.push(`tournament/${id}`);
      fail();
      const tournament = tournaments.get(id);
      if (!tournament) return { result: { kind: "gone" }, rateLimit: RATE };
      return { result: { kind: "found", tournament }, rateLimit: RATE };
    },
    async teamRegistrations(id) {
      calls.push(`registrations/${id}`);
      fail();
      const entry = registrations.get(id);
      if (!entry) return { result: { kind: "gone" }, rateLimit: RATE };
      return { result: { kind: "found", ...entry }, rateLimit: RATE };
    },
  };
  return { api, organiser, tournaments, registrations, failing, calls };
}

type Fake = ReturnType<typeof fakeOpl>;

/** A season like the winter season 2026/27 on OPL; returns the leaf IDs by name. */
function addSeason(
  opl: Fake,
  input: {
    id: number;
    name: string;
    gameId?: number;
    groups?: Partial<Record<"l1a" | "l1b" | "l3" | "wildcard" | "playoffs", number[]>>;
    leagueWord?: (division: number) => string;
  },
) {
  const word = input.leagueWord ?? ((division: number) => `${division}. Liga`);
  const leaves = {
    wildcard: {
      id: input.id + 1,
      name: `${input.name} - Wildcardturnier - Wildcardturnier 1. Liga`,
    },
    l1a: { id: input.id + 2, name: `${input.name} - Gruppenphase - ${word(1)} - Gruppe A` },
    l1b: { id: input.id + 3, name: `${input.name} - Gruppenphase - ${word(1)} - Gruppe B` },
    l3: { id: input.id + 4, name: `${input.name} - Gruppenphase - ${word(3)}` },
    playoffs: { id: input.id + 5, name: `${input.name} - Playoffs - Playoffs 1. Liga` },
    hidden: { id: input.id + 6, name: "" },
  };
  opl.tournaments.set(input.id, {
    id: input.id,
    name: input.name,
    gameId: input.gameId ?? 2,
    ancestors: [],
    leafes: Object.values(leaves).map((leaf) => leaf.id),
  });
  for (const [key, leaf] of Object.entries(leaves)) {
    if (key === "hidden") continue; // OPL answers 404 for it
    const teamIds = input.groups?.[key as keyof NonNullable<typeof input.groups>] ?? [];
    opl.registrations.set(leaf.id, { name: leaf.name, teamIds });
  }
  return leaves;
}

/** Steps until nothing is due at `now`; returns how many steps ran. */
async function runCrawl(opl: Fake, now = NOW): Promise<number> {
  for (let steps = 0; steps < 60; steps++) {
    const result = await uniligaTick({ now, opl: opl.api });
    if (!result) return steps;
  }
  throw new Error("the run never ended");
}

async function registrationsOf(oplTeamId: number) {
  return prisma.uniligaRegistration.findMany({
    where: { oplTeamId },
    select: { division: true, group: true, crawl: { select: { failed: true } } },
  });
}

/** A team linked with the OPL team `oplTeamId`, like after linkOplTeam. */
async function linkedTeam(oplTeamId: number) {
  const created = await createTeamWithMembers();
  await prisma.team.update({
    where: { id: created.team.id },
    data: { oplTeamId, oplLinkedAt: NOW, oplCheckedAt: NOW, oplNextCheckAt: null },
  });
  return created;
}

describe("parseLeague", () => {
  it("reads league and group of the group stage in both spellings", () => {
    expect(parseLeague(WINTER, `${WINTER} - Gruppenphase - 1. Liga - Gruppe A`)).toEqual({
      division: 1,
      group: "A",
    });
    expect(parseLeague(SUMMER, `${SUMMER} - Gruppenphase - Liga 2 - Gruppe B`)).toEqual({
      division: 2,
      group: "B",
    });
    expect(parseLeague(WINTER, `${WINTER} - Gruppenphase - 3. Liga`)).toEqual({
      division: 3,
      group: null,
    });
  });

  it("ignores wildcard, playoffs, other seasons and leaves without a league", () => {
    expect(parseLeague(WINTER, `${WINTER} - Wildcardturnier - Wildcardturnier 1. Liga`)).toBeNull();
    expect(parseLeague(WINTER, `${WINTER} - Playoffs - Playoffs 1. Liga`)).toBeNull();
    expect(parseLeague(WINTER, `${SUMMER} - Gruppenphase - 1. Liga - Gruppe A`)).toBeNull();
    expect(parseLeague(WINTER, `${WINTER} - Gruppenphase - Finale`)).toBeNull();
  });
});

describe("chosenLeagues", () => {
  it("keeps only leagues of the season, once and in order", () => {
    expect(chosenLeagues([3, 1, 3, 9], [1, 2, 3])).toEqual([1, 3]);
    expect(chosenLeagues([], [1, 2])).toEqual([]);
    expect(chosenLeagues(null, [1, 2])).toEqual([]);
    expect(chosenLeagues([1], [])).toEqual([]);
  });
});

describe("OPL client for the Uniliga", () => {
  function fakeFetch(status: number, body: string) {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(String(url));
      return new Response(status === 404 ? null : body, {
        status,
        headers: { "RateLimit-Remaining": "88", "RateLimit-Reset": "12" },
      });
    }) as typeof globalThis.fetch;
    return { fetch, urls };
  }

  it("lists the positive tournament IDs, newest first", async () => {
    const { fetch, urls } = fakeFetch(
      200,
      JSON.stringify({
        data: { ID: 3, name: "Uniliga", tournaments: ["-191", "273", "8250", "x"] },
      }),
    );
    const client = createOplClient({ apiKey: "k", fetch });
    const { result, rateLimit } = await client.organiserTournaments(3);
    expect(result).toEqual({ kind: "found", tournamentIds: [8250, 273] });
    expect(rateLimit).toEqual({ remaining: 88, resetSec: 12 });
    expect(urls[0]).toBe("https://www.opleague.pro/api/v4/organiser/3/tournaments");
  });

  it("reads a tournament's game, ancestors and leaves", async () => {
    const { fetch } = fakeFetch(
      200,
      JSON.stringify({
        data: {
          ID: 8250,
          name: WINTER,
          game: { ID: 2, name: "VALORANT", short_name: "Val" },
          ancestors: [],
          leafes: [8281, 8436],
          url: "https://www.opleague.pro/event/8250",
        },
      }),
    );
    const { result } = await createOplClient({ apiKey: "k", fetch }).tournament(8250);
    expect(result).toEqual({
      kind: "found",
      tournament: { id: 8250, name: WINTER, gameId: 2, ancestors: [], leafes: [8281, 8436] },
    });
  });

  it("takes only the team IDs of the registrations, as object or empty list", async () => {
    const object = fakeFetch(
      200,
      JSON.stringify({
        data: {
          ID: 8436,
          name: `${WINTER} - Gruppenphase - 1. Liga - Gruppe A`,
          ancestors: [8283, 8279, 8250],
          team_registrations: {
            "5341": { ID: 5341, name: "Team A", discord: "https://discord.gg/x" },
            "5384": { ID: 5384, name: "Team B" },
          },
        },
      }),
    );
    expect(
      (await createOplClient({ apiKey: "k", fetch: object.fetch }).teamRegistrations(8436)).result,
    ).toEqual({
      kind: "found",
      name: `${WINTER} - Gruppenphase - 1. Liga - Gruppe A`,
      teamIds: [5341, 5384],
    });
    const empty = fakeFetch(
      200,
      JSON.stringify({ data: { ID: 8437, name: "x", ancestors: [], team_registrations: [] } }),
    );
    expect(
      (await createOplClient({ apiKey: "k", fetch: empty.fetch }).teamRegistrations(8437)).result,
    ).toEqual({ kind: "found", name: "x", teamIds: [] });
  });

  it("gives gone for 404 and an error without the body for anything unexpected", async () => {
    const missing = fakeFetch(404, "");
    expect(
      (await createOplClient({ apiKey: "k", fetch: missing.fetch }).teamRegistrations(8280)).result,
    ).toEqual({ kind: "gone" });
    const odd = fakeFetch(200, JSON.stringify({ data: { secret: "token-k" } }));
    const error = await createOplClient({ apiKey: "k", fetch: odd.fetch })
      .tournament(1)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OplError);
    expect((error as OplError).reason).toBe("transient");
    expect(String((error as OplError).message)).not.toContain("token");
  });
});

describe("Uniliga run", () => {
  it("stores the group stage teams of the newest VALORANT season, one call per step", async () => {
    const opl = fakeOpl();
    const [a, b, c, wild, play] = [oplId(), oplId(), oplId(), oplId(), oplId()];
    opl.organiser.ids = [8250, 8249];
    addSeason(opl, { id: 8250, name: WINTER, groups: { l1a: [a], l1b: [b], l3: [c, c] } });
    opl.registrations.get(8251)!.teamIds = [wild];
    opl.registrations.get(8255)!.teamIds = [play];
    const steps = await runCrawl(opl);
    // Organiser, season, six leaves (one hidden with 404).
    expect(steps).toBe(8);
    expect(opl.calls).toHaveLength(8);
    expect(opl.calls).not.toContain("tournament/8249");
    expect(await registrationsOf(a)).toEqual([
      { division: 1, group: "A", crawl: { failed: false } },
    ]);
    expect(await registrationsOf(b)).toEqual([
      { division: 1, group: "B", crawl: { failed: false } },
    ]);
    expect(await registrationsOf(c)).toEqual([
      { division: 3, group: null, crawl: { failed: false } },
    ]);
    expect(await registrationsOf(wild)).toEqual([]);
    expect(await registrationsOf(play)).toEqual([]);
    const crawl = await prisma.oplCrawl.findFirstOrThrow();
    expect(crawl).toMatchObject({ startedAt: NOW, finishedAt: NOW, failed: false });
  });

  it("skips other games and single tournaments to find the season", async () => {
    const opl = fakeOpl();
    const team = oplId();
    opl.organiser.ids = [8300, 8299, 8250];
    addSeason(opl, { id: 8300, name: "Uniliga LOL Winterseason 2026/27", gameId: 11 });
    opl.tournaments.set(8299, {
      id: 8299,
      name: "Qualifier",
      gameId: 2,
      ancestors: [],
      leafes: [8299],
    });
    addSeason(opl, { id: 8250, name: WINTER, groups: { l1a: [team] } });
    await runCrawl(opl);
    expect(await registrationsOf(team)).toHaveLength(1);
  });

  it("falls back to the last season while the new one's groups are empty", async () => {
    const opl = fakeOpl();
    const team = oplId();
    opl.organiser.ids = [9000, 7591];
    addSeason(opl, { id: 9000, name: "Uniliga VALORANT Sommerseason 2027" });
    addSeason(opl, {
      id: 7591,
      name: SUMMER,
      groups: { l1b: [team] },
      leagueWord: (division) => `Liga ${division}`,
    });
    await runCrawl(opl);
    expect(await registrationsOf(team)).toEqual([
      { division: 1, group: "B", crawl: { failed: false } },
    ]);
  });

  it("looks at no more than the newest tournaments and ends empty without a season", async () => {
    const opl = fakeOpl();
    opl.organiser.ids = Array.from({ length: 20 }, (_, i) => 20_000 - i);
    const steps = await runCrawl(opl);
    expect(steps).toBe(1 + UNILIGA_ROOT_LIMIT);
    expect(await prisma.oplCrawl.findFirstOrThrow()).toMatchObject({ failed: false });
    expect((await getUniligaLeagues("all")).options).toEqual([]);
  });

  it("starts a new run 11 h after the last one began and drops the old one when done", async () => {
    const opl = fakeOpl();
    const team = oplId();
    opl.organiser.ids = [8250];
    addSeason(opl, { id: 8250, name: WINTER, groups: { l1a: [team] } });
    await runCrawl(opl);
    expect(await uniligaTick({ now: new Date(NOW.getTime() + 10 * HOUR), opl: opl.api })).toBe(
      null,
    );
    const later = new Date(NOW.getTime() + 11 * HOUR);
    opl.registrations.get(8252)!.teamIds = [];
    opl.registrations.get(8253)!.teamIds = [team];
    // While the new run is going, the old one is shown.
    await uniligaTick({ now: later, opl: opl.api });
    await uniligaTick({ now: later, opl: opl.api });
    await uniligaTick({ now: later, opl: opl.api });
    await uniligaTick({ now: later, opl: opl.api });
    expect((await getUniligaLeagues([team])).byTeam.get(team)).toEqual({ division: 1, group: "A" });
    await runCrawl(opl, later);
    expect((await getUniligaLeagues([team])).byTeam.get(team)).toEqual({ division: 1, group: "B" });
    expect(await prisma.oplCrawl.count()).toBe(1);
  });

  it("tries a failed step again after 10 min and gives up after the third failure", async () => {
    const opl = fakeOpl();
    const team = oplId();
    opl.organiser.ids = [8250];
    addSeason(opl, { id: 8250, name: WINTER, groups: { l1a: [team] } });
    await runCrawl(opl);
    const later = new Date(NOW.getTime() + 12 * HOUR);
    opl.failing.error = new OplError("transient", 500);
    opl.failing.times = 3;
    expect(await uniligaTick({ now: later, opl: opl.api })).toEqual({
      checked: true,
      rateLimit: null,
    });
    expect(await uniligaTick({ now: later, opl: opl.api })).toBeNull();
    const retry = new Date(later.getTime() + 10 * MINUTE);
    await uniligaTick({ now: retry, opl: opl.api });
    await uniligaTick({ now: new Date(retry.getTime() + 10 * MINUTE), opl: opl.api });
    const failed = await prisma.oplCrawl.findFirstOrThrow({ where: { startedAt: later } });
    expect(failed).toMatchObject({ failed: true });
    // The last successful run stays shown; a new one follows an hour after the failure.
    expect((await getUniligaLeagues([team])).byTeam.get(team)).toEqual({ division: 1, group: "A" });
    const failedAt = failed.finishedAt!;
    expect(
      await uniligaTick({ now: new Date(failedAt.getTime() + 59 * MINUTE), opl: opl.api }),
    ).toBe(null);
    expect(
      await uniligaTick({ now: new Date(failedAt.getTime() + HOUR), opl: opl.api }),
    ).not.toBeNull();
  });

  it("never falls back to an older season after failures in the new one", async () => {
    const opl = fakeOpl();
    const team = oplId();
    opl.organiser.ids = [9000, 8250];
    addSeason(opl, {
      id: 9000,
      name: "Uniliga VALORANT Sommerseason 2027",
      groups: { l1a: [team] },
    });
    addSeason(opl, { id: 8250, name: WINTER, groups: { l1a: [oplId()] } });
    await uniligaTick({ now: NOW, opl: opl.api }); // organiser
    await uniligaTick({ now: NOW, opl: opl.api }); // season 9000
    await uniligaTick({ now: NOW, opl: opl.api }); // wildcard leaf
    opl.failing.error = new OplError("transient", 503);
    opl.failing.times = 3;
    for (let i = 0; i < 3; i++) {
      await uniligaTick({ now: new Date(NOW.getTime() + i * 10 * MINUTE), opl: opl.api });
    }
    expect(await prisma.oplCrawl.findFirstOrThrow()).toMatchObject({ failed: true });
    expect(await prisma.uniligaRegistration.count()).toBe(0);
    expect(opl.calls).not.toContain("tournament/8250");
  });

  it("fails the run when OPL does not know the Uniliga", async () => {
    const opl = fakeOpl();
    opl.organiser.ids = "gone";
    await uniligaTick({ now: NOW, opl: opl.api });
    await uniligaTick({ now: new Date(NOW.getTime() + 10 * MINUTE), opl: opl.api });
    await uniligaTick({ now: new Date(NOW.getTime() + 20 * MINUTE), opl: opl.api });
    expect(await prisma.oplCrawl.findFirstOrThrow()).toMatchObject({ failed: true });
  });

  it("writes nothing on a used-up limit and throws on a rejected key", async () => {
    const opl = fakeOpl();
    opl.organiser.ids = [8250];
    opl.failing.error = new OplError("rate", 429, { remaining: 0, resetSec: 40 });
    opl.failing.times = 1;
    expect(await uniligaTick({ now: NOW, opl: opl.api })).toEqual({
      checked: true,
      rateLimit: { remaining: 0, resetSec: 40 },
    });
    const crawl = await prisma.oplCrawl.findFirstOrThrow();
    expect(crawl).toMatchObject({ nextStepAt: NOW, cursor: { step: "organiser", failures: 0 } });
    opl.failing.error = new OplError("auth", 401);
    opl.failing.times = 1;
    await expect(uniligaTick({ now: NOW, opl: opl.api })).rejects.toBeInstanceOf(OplError);
    expect(await prisma.oplCrawl.findFirstOrThrow()).toMatchObject({
      cursor: { step: "organiser", failures: 0 },
    });
  });

  it("goes before due link checks in oplTick", async () => {
    const opl = fakeOpl();
    const user = await createUser();
    // Only this link is due; earlier tests leave others behind.
    await prisma.user.updateMany({
      where: { oplUserId: { not: null } },
      data: { oplNextCheckAt: null },
    });
    await prisma.team.updateMany({
      where: { oplTeamId: { not: null } },
      data: { oplNextCheckAt: null },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { oplUserId: oplId(), oplLinkedAt: NOW, oplNextCheckAt: NOW },
    });
    opl.organiser.ids = [];
    await oplTick({ now: NOW, opl: opl.api });
    expect(opl.calls).toEqual(["organiser"]);
    // The run ended empty; the next tick checks the link.
    await oplTick({ now: NOW, opl: opl.api });
    expect(opl.calls).toEqual(["organiser", "user"]);
    await prisma.user.update({ where: { id: user.id }, data: { oplNextCheckAt: null } });
  });
});

describe("league on cards, team list and team tab", () => {
  async function seasonWith(groups: { l1a?: number[]; l3?: number[] }) {
    const opl = fakeOpl();
    opl.organiser.ids = [8250];
    addSeason(opl, { id: 8250, name: WINTER, groups });
    await runCrawl(opl);
  }

  it("shows the league of linked teams on the public board and filters by it", async () => {
    const first = oplId();
    const third = oplId();
    const one = await linkedTeam(first);
    const three = await linkedTeam(third);
    const unlinked = await createTeamWithMembers();
    await seasonWith({ l1a: [first], l3: [third, oplId()] });
    const requests = await Promise.all(
      [one, three, unlinked].map((team) => createOpenRequest(team.captain.id)),
    );
    const card = (board: Awaited<ReturnType<typeof getPublicBoard>>, index: number) =>
      board.requests.find((request) => request.id === requests[index]!.id);

    const all = await getPublicBoard({ now: NOW });
    expect(all.leagueOptions).toEqual([1, 3]);
    expect(card(all, 0)?.team.league).toEqual({ division: 1, group: "A" });
    expect(card(all, 1)?.team.league).toEqual({ division: 3, group: null });
    expect(card(all, 2)?.team.league).toBeNull();

    const thirdOnly = await getPublicBoard({ now: NOW, leagues: [3, 3] });
    expect(thirdOnly.filter.leagues).toEqual([3]);
    expect(card(thirdOnly, 0)).toBeUndefined();
    expect(card(thirdOnly, 1)).toBeDefined();
    expect(card(thirdOnly, 2)).toBeUndefined();

    // A league the season doesn't have is dropped: no filter.
    const unknown = await getPublicBoard({ now: NOW, leagues: [7] });
    expect(unknown.filter.leagues).toEqual([]);
    expect(card(unknown, 2)).toBeDefined();
  });

  it("shows the league in the team list and the team tab, and filters the list", async () => {
    const id = oplId();
    const team = await linkedTeam(id);
    const other = await createTeamWithMembers();
    await seasonWith({ l1a: [id] });
    const viewer = await createUser();
    const list = await getTeamList({ now: NOW, userId: viewer.id, leagues: [1] });
    expect(list.filter.leagues).toEqual([1]);
    expect(list.leagueOptions).toEqual([1]);
    expect(list.teams.find((entry) => entry.id === team.team.id)?.league).toEqual({
      division: 1,
      group: "A",
    });
    expect(list.teams.find((entry) => entry.id === other.team.id)).toBeUndefined();
    expect((await getMyTeam(team.captain.id))?.league).toEqual({ division: 1, group: "A" });
    expect((await getMyTeam(other.captain.id))?.league).toBeNull();
  });

  it("shows nothing before the first run and for a team registered but not linked", async () => {
    const id = oplId();
    const team = await createTeamWithMembers();
    expect((await getMyTeam(team.captain.id))?.league).toBeNull();
    await seasonWith({ l1a: [id] });
    expect((await getMyTeam(team.captain.id))?.league).toBeNull();
    // Linking later shows it at once, from the stored registrations.
    await prisma.team.update({
      where: { id: team.team.id },
      data: { oplTeamId: id, oplLinkedAt: NOW },
    });
    expect((await getMyTeam(team.captain.id))?.league).toEqual({ division: 1, group: "A" });
  });
});
