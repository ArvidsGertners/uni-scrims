import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  type OplApi,
  OplError,
  type OplRosterMember,
  OPL_GONE_LIMIT,
  createOplClient,
  createTeam,
  dissolveTeam,
  getAccount,
  getMyTeam,
  isDomainError,
  joinTeam,
  leaveTeam,
  linkOplTeam,
  linkOplUser,
  nextOplCheck,
  oplTick,
  parseOplUrl,
  previewOplTeam,
  quoteDiscordIds,
  removeMember,
  rosterMatches,
  unlinkOplTeam,
  unlinkOplUser,
} from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser } from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

const HOUR = 60 * 60 * 1000;
const LATER = new Date(NOW.getTime() + 60_000);
const DAY_LATER = new Date(NOW.getTime() + 30 * HOUR);

// OPL IDs are unique in the database, which is only reset once per run.
let lastOplId = 1_000_000 + Math.floor(Math.random() * 100_000_000);
function oplId(): number {
  return ++lastOplId;
}

type FakeTeam = { name: string; shortName: string | null; members: OplRosterMember[] };

/** OPL in memory: profiles with their Discord ID, teams with their roster; counts the calls. */
function fakeOpl() {
  const users = new Map<number, string | null | "gone">();
  const teams = new Map<number, FakeTeam | "gone">();
  const failing: { error: OplError | null } = { error: null };
  let calls = 0;
  const rateLimit = { remaining: 99, resetSec: 30 };
  const api: OplApi = {
    async user(id) {
      calls++;
      if (failing.error) throw failing.error;
      const entry = users.get(id);
      if (entry === undefined || entry === "gone") return { result: { kind: "gone" }, rateLimit };
      return { result: { kind: "found", discordId: entry }, rateLimit };
    },
    async teamRoster(id) {
      calls++;
      if (failing.error) throw failing.error;
      const entry = teams.get(id);
      if (entry === undefined || entry === "gone") return { result: { kind: "gone" }, rateLimit };
      return { result: { kind: "found", ...entry }, rateLimit };
    },
  };
  return {
    api,
    users,
    teams,
    failing,
    get calls() {
      return calls;
    },
  };
}

async function expectError(promise: Promise<unknown>, key: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(isDomainError(error), String(error)).toBe(true);
  expect((error as { text: { key: string } }).text.key).toBe(key);
}

/** A user with an OPL profile in the fake, linked. */
async function linkedUser(
  opl: ReturnType<typeof fakeOpl>,
  user?: { id: string; discordId: string },
) {
  const account = user ?? (await createUser());
  const id = oplId();
  opl.users.set(id, account.discordId);
  await linkOplUser({
    userId: account.id,
    url: `https://www.opleague.pro/user/${id}-Name`,
    opl: opl.api,
    now: NOW,
  });
  return { ...account, oplUserId: id };
}

/** Only checks of links that are due now; earlier tests leave other links behind. */
async function makeOnlyDue(where: { userId?: string; teamId?: string }) {
  await prisma.user.updateMany({
    where: { oplUserId: { not: null }, NOT: where.userId ? { id: where.userId } : undefined },
    data: { oplNextCheckAt: new Date("2100-01-01T00:00:00Z") },
  });
  await prisma.team.updateMany({
    where: { oplTeamId: { not: null }, NOT: where.teamId ? { id: where.teamId } : undefined },
    data: { oplNextCheckAt: new Date("2100-01-01T00:00:00Z") },
  });
  if (where.userId) {
    await prisma.user.update({ where: { id: where.userId }, data: { oplNextCheckAt: NOW } });
  }
  if (where.teamId) {
    await prisma.team.update({ where: { id: where.teamId }, data: { oplNextCheckAt: NOW } });
  }
}

describe("parseOplUrl", () => {
  it("takes profile and team links with or without name, scheme, www and language", () => {
    expect(parseOplUrl("user", "https://www.opleague.pro/user/21404-Norial")).toBe(21404);
    expect(parseOplUrl("user", "opleague.pro/user/21404")).toBe(21404);
    expect(parseOplUrl("team", " https://www.opleague.pro/de/team/5650-DG-Vortex/matches ")).toBe(
      5650,
    );
  });

  it("rejects other hosts, kinds, schemes, credentials and ports", async () => {
    for (const raw of [
      "",
      "https://evil.example/user/1",
      "https://www.opleague.pro.evil.example/user/1",
      "http://www.opleague.pro/user/1",
      "https://a:b@www.opleague.pro/user/1",
      "https://www.opleague.pro:8443/user/1",
      "https://www.opleague.pro/team/1",
      "https://www.opleague.pro/user/abc",
      "https://www.opleague.pro/user/0",
    ]) {
      await expectError(
        Promise.resolve().then(() => parseOplUrl("user", raw)),
        "oplUserLinkInvalid",
      );
    }
    await expectError(
      Promise.resolve().then(() => parseOplUrl("team", "https://www.opleague.pro/user/1")),
      "oplTeamLinkInvalid",
    );
  });
});

describe("OPL client", () => {
  function fakeFetch(status: number, body: string, headers: Record<string, string> = {}) {
    const requests: { url: string; auth: string | null }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      requests.push({ url, auth: new Headers(init?.headers).get("authorization") });
      return new Response(body, { status, headers });
    }) as typeof globalThis.fetch;
    return { fetch, requests };
  }

  it("keeps 18-digit Discord IDs exact", () => {
    expect(JSON.parse(quoteDiscordIds('{"discord_ID": 454721796038123456, "ID": 1}'))).toEqual({
      discord_ID: "454721796038123456",
      ID: 1,
    });
  });

  it("reads a roster, the rate limit and sends the key", async () => {
    const body = `{"data":{"ID":5650,"name":"DG Vortex","short_name":"DGV","url":"https://www.opleague.pro/team/5650-DG-Vortex","users":{"1":{"ID":1,"first_name":"Real","last_name":"Name","age":21,"discord_ID":454721796038123456},"2":{"ID":2,"discord_ID":null}}}}`;
    const { fetch, requests } = fakeFetch(200, body, {
      "RateLimit-Remaining": "42",
      "RateLimit-Reset": "17",
    });
    const client = createOplClient({
      apiKey: "secret",
      baseUrl: "https://opl.test/api/v4/",
      fetch,
    });
    const response = await client.teamRoster(5650);
    expect(requests).toEqual([
      { url: "https://opl.test/api/v4/team/5650/users", auth: "Bearer secret" },
    ]);
    expect(response).toEqual({
      result: {
        kind: "found",
        name: "DG Vortex",
        shortName: "DGV",
        members: [
          { oplUserId: 1, discordId: "454721796038123456" },
          { oplUserId: 2, discordId: null },
        ],
      },
      rateLimit: { remaining: 42, resetSec: 17 },
    });
  });

  it("treats a deleted team, an empty roster and a missing user as gone", async () => {
    const deleted = `{"data":{"ID":9,"name":"deleted","short_name":"deleted","url":"\\/","users":[]}}`;
    const team = createOplClient({ apiKey: "k", fetch: fakeFetch(200, deleted).fetch });
    expect((await team.teamRoster(9)).result).toEqual({ kind: "gone" });
    const user = createOplClient({
      apiKey: "k",
      fetch: fakeFetch(404, '{"data":{"ID":null}}').fetch,
    });
    expect((await user.user(9)).result).toEqual({ kind: "gone" });
    const empty = `{"data":{"ID":9,"name":"Team","short_name":null,"url":"https://www.opleague.pro/team/9","users":[]}}`;
    const emptyTeam = createOplClient({ apiKey: "k", fetch: fakeFetch(200, empty).fetch });
    expect((await emptyTeam.teamRoster(9)).result).toEqual({
      kind: "found",
      name: "Team",
      shortName: null,
      members: [],
    });
  });

  it("fails without the body: auth for 401 and 403, transient otherwise", async () => {
    const cases: [number, string, "auth" | "transient"][] = [
      [401, '{"token":"secret-echo"}', "auth"],
      [403, "secret-echo", "auth"],
      [500, "secret-echo", "transient"],
      [200, "not json secret-echo", "transient"],
      [200, '{"data":{"unexpected":"secret-echo"}}', "transient"],
    ];
    for (const [status, body, reason] of cases) {
      const client = createOplClient({ apiKey: "k", fetch: fakeFetch(status, body).fetch });
      const error = await client.user(1).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(OplError);
      expect((error as OplError).reason).toBe(reason);
      expect(String(error)).not.toContain("secret-echo");
      expect(JSON.stringify(error)).not.toContain("secret-echo");
    }
    const offline = createOplClient({
      apiKey: "k",
      fetch: (async () => {
        throw new Error("network down");
      }) as typeof globalThis.fetch,
    });
    expect(await offline.user(1).catch((e: unknown) => (e as OplError).reason)).toBe("transient");
  });
});

describe("rosterMatches and nextOplCheck", () => {
  it("matches members by Discord ID and counts the rest", () => {
    const roster = [
      { oplUserId: 1, discordId: "111" },
      { oplUserId: 2, discordId: null },
      { oplUserId: 3, discordId: "333" },
    ];
    expect(
      rosterMatches(roster, [
        { userId: "b", discordId: "333" },
        { userId: "a", discordId: "111" },
        { userId: "c", discordId: "999" },
      ]),
    ).toEqual({ userIds: ["a", "b"], others: 1 });
  });

  it("spreads the next check over 20 to 28 hours", () => {
    expect(nextOplCheck(NOW, () => 0).getTime() - NOW.getTime()).toBe(20 * HOUR);
    expect(nextOplCheck(NOW, () => 0.5).getTime() - NOW.getTime()).toBe(24 * HOUR);
    expect(nextOplCheck(NOW, () => 0.999).getTime() - NOW.getTime()).toBeLessThan(28 * HOUR);
  });
});

describe("linkOplUser", () => {
  it("links a profile with the account's Discord ID, shows it and unlinks", async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({
      oplUserId: user.oplUserId,
      oplLinkedAt: NOW,
      oplCheckedAt: NOW,
      oplFailures: 0,
    });
    expect(row.oplNextCheckAt!.getTime()).toBeGreaterThanOrEqual(NOW.getTime() + 20 * HOUR);
    expect((await getAccount(user.id)).opl).toEqual({
      id: user.oplUserId,
      url: `https://www.opleague.pro/user/${user.oplUserId}`,
      linkedAt: NOW,
      checkedAt: NOW,
    });
    await unlinkOplUser({ userId: user.id });
    expect((await getAccount(user.id)).opl).toBeNull();
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      oplUserId: null,
      oplNextCheckAt: null,
    });
  });

  it("refuses another or a missing Discord ID, unknown profiles and taken ones", async () => {
    const opl = fakeOpl();
    const user = await createUser();
    const other = oplId();
    opl.users.set(other, "123456789012345678");
    const url = (id: number) => `https://www.opleague.pro/user/${id}`;
    await expectError(
      linkOplUser({ userId: user.id, url: url(other), opl: opl.api, now: NOW }),
      "oplDiscordMismatch",
    );
    const noDiscord = oplId();
    opl.users.set(noDiscord, null);
    await expectError(
      linkOplUser({ userId: user.id, url: url(noDiscord), opl: opl.api, now: NOW }),
      "oplDiscordMismatch",
    );
    await expectError(
      linkOplUser({ userId: user.id, url: url(oplId()), opl: opl.api, now: NOW }),
      "oplUserNotFound",
    );
    // The same profile on two accounts would need the same Discord ID: only as stale data.
    const holder = await linkedUser(opl);
    opl.users.set(holder.oplUserId, user.discordId);
    await expectError(
      linkOplUser({ userId: user.id, url: url(holder.oplUserId), opl: opl.api, now: NOW }),
      "oplProfileTaken",
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).oplUserId).toBeNull();
  });

  it("says OPL can't be reached without a key or when the call fails", async () => {
    const user = await createUser();
    const url = "https://www.opleague.pro/user/5";
    await expectError(linkOplUser({ userId: user.id, url, opl: null, now: NOW }), "oplUnavailable");
    const opl = fakeOpl();
    opl.failing.error = new OplError("transient", 503);
    await expectError(
      linkOplUser({ userId: user.id, url, opl: opl.api, now: NOW }),
      "oplUnavailable",
    );
  });
});

describe("linkOplTeam", () => {
  it("links with the captain in the roster; members in it are matches, the rest a number", async () => {
    const opl = fakeOpl();
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 2 });
    const linked = await linkedUser(opl, captain);
    const id = oplId();
    opl.teams.set(id, {
      name: "OPL Team",
      shortName: "OPL",
      members: [
        { oplUserId: linked.oplUserId, discordId: captain.discordId },
        { oplUserId: oplId(), discordId: members[0]!.discordId },
        { oplUserId: oplId(), discordId: "999999999999999999" },
        { oplUserId: oplId(), discordId: null },
      ],
    });
    await linkOplTeam({
      userId: captain.id,
      teamId: team.id,
      url: `opleague.pro/team/${id}`,
      opl: opl.api,
      now: NOW,
    });
    const view = (await getMyTeam(members[1]!.id))!;
    expect(view.opl).toEqual({
      id,
      url: `https://www.opleague.pro/team/${id}`,
      linkedAt: NOW,
      checkedAt: NOW,
      matches: [captain, members[0]!]
        .map((user) => ({ id: user.id, name: user.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
      others: 2,
    });
    expect(view.ownOplLinked).toBe(false);
    expect((await getMyTeam(captain.id))!.ownOplLinked).toBe(true);

    await unlinkOplTeam({ userId: captain.id, teamId: team.id });
    expect((await getMyTeam(captain.id))!.opl).toBeNull();
    expect(await prisma.oplRosterMatch.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("needs a linked captain in the roster, an existing team that is free", async () => {
    const opl = fakeOpl();
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const id = oplId();
    const url = `https://www.opleague.pro/team/${id}`;
    opl.teams.set(id, { name: "T", shortName: null, members: [] });
    await expectError(
      linkOplTeam({ userId: captain.id, teamId: team.id, url, opl: opl.api, now: NOW }),
      "oplAccountRequired",
    );
    const linked = await linkedUser(opl, captain);
    await expectError(
      linkOplTeam({ userId: captain.id, teamId: team.id, url, opl: opl.api, now: NOW }),
      "oplNotInRoster",
    );
    await expectError(
      linkOplTeam({
        userId: captain.id,
        teamId: team.id,
        url: `https://www.opleague.pro/team/${oplId()}`,
        opl: opl.api,
        now: NOW,
      }),
      "oplTeamNotFound",
    );
    // Only the captain.
    await linkedUser(opl, members[0]!);
    await expectError(
      linkOplTeam({ userId: members[0]!.id, teamId: team.id, url, opl: opl.api, now: NOW }),
      "notCaptain",
    );

    const roster = [{ oplUserId: linked.oplUserId, discordId: captain.discordId }];
    opl.teams.set(id, { name: "T", shortName: null, members: roster });
    const second = await createTeamWithMembers();
    const secondLinked = await linkedUser(opl, second.captain);
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [
        ...roster,
        { oplUserId: secondLinked.oplUserId, discordId: second.captain.discordId },
      ],
    });
    await linkOplTeam({ userId: captain.id, teamId: team.id, url, opl: opl.api, now: NOW });
    await expectError(
      linkOplTeam({
        userId: second.captain.id,
        teamId: second.team.id,
        url,
        opl: opl.api,
        now: NOW,
      }),
      "oplTeamTaken",
    );
  });

  it("does not link a banned team", async () => {
    const opl = fakeOpl();
    const { team, captain } = await createTeamWithMembers({ banned: true });
    const linked = await linkedUser(opl, captain);
    const id = oplId();
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [{ oplUserId: linked.oplUserId, discordId: null }],
    });
    await expectError(
      linkOplTeam({
        userId: captain.id,
        teamId: team.id,
        url: `https://www.opleague.pro/team/${id}`,
        opl: opl.api,
        now: NOW,
      }),
      "teamBanned",
    );
  });
});

describe("createTeam with an OPL team and previewOplTeam", () => {
  it("fills in the form and founds the team linked", async () => {
    const opl = fakeOpl();
    const founder = await linkedUser(opl);
    const id = oplId();
    const url = `https://www.opleague.pro/team/${id}-Name`;
    opl.teams.set(id, {
      name: "Vortex",
      shortName: "VTX",
      members: [
        { oplUserId: founder.oplUserId, discordId: founder.discordId },
        { oplUserId: oplId(), discordId: null },
      ],
    });
    expect(await previewOplTeam({ userId: founder.id, url, opl: opl.api })).toEqual({
      name: "Vortex",
      shortName: "VTX",
    });
    const name = `Vortex ${id}`;
    const team = await createTeam({
      userId: founder.id,
      name,
      tag: "VTX",
      now: NOW,
      opl: { url, api: opl.api },
    });
    const view = (await getMyTeam(founder.id))!;
    expect(view.id).toBe(team.id);
    expect(view.opl).toMatchObject({ id, matches: [{ id: founder.id }], others: 1 });
  });

  it("founds no team when the check fails", async () => {
    const opl = fakeOpl();
    const founder = await linkedUser(opl);
    const id = oplId();
    opl.teams.set(id, { name: "X", shortName: null, members: [] });
    const name = `NoOpl ${id}`;
    await expectError(
      createTeam({
        userId: founder.id,
        name,
        tag: "NOP",
        now: NOW,
        opl: { url: `https://www.opleague.pro/team/${id}`, api: opl.api },
      }),
      "oplNotInRoster",
    );
    expect(await prisma.team.count({ where: { name } })).toBe(0);
    // An empty field founds the team without OPL and without a call.
    const calls = opl.calls;
    await createTeam({
      userId: founder.id,
      name,
      tag: "NOP",
      now: NOW,
      opl: { url: " ", api: opl.api },
    });
    expect(opl.calls).toBe(calls);
    expect((await getMyTeam(founder.id))!.opl).toBeNull();
  });
});

describe("matches when members change", () => {
  async function linkedTeam(extraMembers: number) {
    const opl = fakeOpl();
    const { team, captain, members } = await createTeamWithMembers({ extraMembers });
    const linked = await linkedUser(opl, captain);
    const id = oplId();
    const roster = [captain, ...members].map((user, index) => ({
      oplUserId: index === 0 ? linked.oplUserId : oplId(),
      discordId: user.discordId,
    }));
    opl.teams.set(id, { name: "T", shortName: null, members: roster });
    await linkOplTeam({
      userId: captain.id,
      teamId: team.id,
      url: `https://www.opleague.pro/team/${id}`,
      opl: opl.api,
      now: NOW,
    });
    return { opl, team, captain, members, id, roster };
  }

  it("a leaving or removed member counts among the others", async () => {
    const { team, captain, members } = await linkedTeam(2);
    expect((await getMyTeam(captain.id))!.opl).toMatchObject({ others: 0 });
    await leaveTeam({ userId: members[0]!.id, teamId: team.id, now: LATER });
    await removeMember({ userId: captain.id, teamId: team.id, memberId: members[1]!.id });
    expect((await getMyTeam(captain.id))!.opl).toMatchObject({
      matches: [{ id: captain.id }],
      others: 2,
    });
  });

  it("a join makes the team due at once; dissolving removes the link", async () => {
    const { team, captain } = await linkedTeam(0);
    const joiner = await createUser();
    const { inviteCode } = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    await joinTeam({ userId: joiner.id, inviteCode: inviteCode!, now: LATER });
    expect(
      (await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).oplNextCheckAt,
    ).toEqual(LATER);
    await leaveTeam({ userId: joiner.id, teamId: team.id, now: LATER });
    await dissolveTeam(team.id, LATER);
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).toMatchObject({
      oplTeamId: null,
      oplRosterOthers: null,
      oplNextCheckAt: null,
    });
    expect(await prisma.oplRosterMatch.count({ where: { teamId: team.id } })).toBe(0);
    void captain;
  });
});

describe("oplTick", () => {
  it("checks nothing when nothing is due", async () => {
    const opl = fakeOpl();
    await makeOnlyDue({});
    expect(await oplTick({ now: NOW, opl: opl.api })).toEqual({ checked: false, rateLimit: null });
    expect(opl.calls).toBe(0);
  });

  it("checks a user again in 20 to 28 hours and keeps the link", async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    await makeOnlyDue({ userId: user.id });
    const result = await oplTick({ now: DAY_LATER, opl: opl.api, random: () => 0.25 });
    expect(result).toEqual({ checked: true, rateLimit: { remaining: 99, resetSec: 30 } });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      oplUserId: user.oplUserId,
      oplCheckedAt: DAY_LATER,
      oplNextCheckAt: new Date(DAY_LATER.getTime() + 22 * HOUR),
    });
  });

  it("unlinks a user at once when OPL has another Discord ID", async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    opl.users.set(user.oplUserId, "111111111111111111");
    await makeOnlyDue({ userId: user.id });
    await oplTick({ now: DAY_LATER, opl: opl.api });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).oplUserId).toBeNull();
  });

  it(`unlinks after ${OPL_GONE_LIMIT} times "deleted" in a row, a success resets the count`, async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    opl.users.set(user.oplUserId, "gone");
    await makeOnlyDue({ userId: user.id });
    await oplTick({ now: DAY_LATER, opl: opl.api, random: () => 0.5 });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ oplUserId: user.oplUserId, oplFailures: 1 });
    expect(row.oplNextCheckAt).toEqual(new Date(DAY_LATER.getTime() + 2 * HOUR));
    // Back on OPL: the count starts again.
    opl.users.set(user.oplUserId, user.discordId);
    await makeOnlyDue({ userId: user.id });
    await oplTick({ now: DAY_LATER, opl: opl.api });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).oplFailures).toBe(0);
    opl.users.set(user.oplUserId, "gone");
    for (let i = 1; i < OPL_GONE_LIMIT; i++) {
      await makeOnlyDue({ userId: user.id });
      await oplTick({ now: DAY_LATER, opl: opl.api });
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).oplUserId).toBe(
      user.oplUserId,
    );
    await makeOnlyDue({ userId: user.id });
    await oplTick({ now: DAY_LATER, opl: opl.api });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      oplUserId: null,
      oplFailures: 0,
    });
  });

  it("retries a failed call in about 2 hours without counting; throws on a rejected key", async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    await makeOnlyDue({ userId: user.id });
    opl.failing.error = new OplError("transient", 502);
    expect(await oplTick({ now: DAY_LATER, opl: opl.api, random: () => 0.5 })).toEqual({
      checked: true,
      rateLimit: null,
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      oplFailures: 0,
      oplNextCheckAt: new Date(DAY_LATER.getTime() + 2 * HOUR),
      oplCheckedAt: NOW,
    });
    await makeOnlyDue({ userId: user.id });
    opl.failing.error = new OplError("auth", 401);
    await expect(oplTick({ now: DAY_LATER, opl: opl.api })).rejects.toBeInstanceOf(OplError);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      oplNextCheckAt: NOW,
      oplUserId: user.oplUserId,
    });
  });

  it("checks the most overdue link first, users and teams together", async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    const { team, captain } = await createTeamWithMembers();
    const linked = await linkedUser(opl, captain);
    const id = oplId();
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [{ oplUserId: linked.oplUserId, discordId: captain.discordId }],
    });
    await linkOplTeam({
      userId: captain.id,
      teamId: team.id,
      url: `https://www.opleague.pro/team/${id}`,
      opl: opl.api,
      now: NOW,
    });
    await makeOnlyDue({ userId: user.id, teamId: team.id });
    await prisma.team.update({
      where: { id: team.id },
      data: { oplNextCheckAt: new Date(NOW.getTime() - HOUR) },
    });
    await oplTick({ now: DAY_LATER, opl: opl.api });
    expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).oplCheckedAt).toEqual(
      DAY_LATER,
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).oplCheckedAt).toEqual(
      NOW,
    );
    await oplTick({ now: DAY_LATER, opl: opl.api });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).oplCheckedAt).toEqual(
      DAY_LATER,
    );
  });

  it("rewrites the matches of a team, keeps it without the captain and drops it when gone", async () => {
    const opl = fakeOpl();
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const linked = await linkedUser(opl, captain);
    const id = oplId();
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [{ oplUserId: linked.oplUserId, discordId: captain.discordId }],
    });
    await linkOplTeam({
      userId: captain.id,
      teamId: team.id,
      url: `https://www.opleague.pro/team/${id}`,
      opl: opl.api,
      now: NOW,
    });
    // The captain left the OPL roster, the member joined it, two others too.
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [
        { oplUserId: oplId(), discordId: members[0]!.discordId },
        { oplUserId: oplId(), discordId: null },
        { oplUserId: oplId(), discordId: "222222222222222222" },
      ],
    });
    await makeOnlyDue({ teamId: team.id });
    await oplTick({ now: DAY_LATER, opl: opl.api });
    expect((await getMyTeam(captain.id))!.opl).toMatchObject({
      checkedAt: DAY_LATER,
      matches: [{ id: members[0]!.id }],
      others: 2,
    });
    opl.teams.set(id, "gone");
    for (let i = 0; i < OPL_GONE_LIMIT; i++) {
      await makeOnlyDue({ teamId: team.id });
      await oplTick({ now: DAY_LATER, opl: opl.api });
    }
    expect((await getMyTeam(captain.id))!.opl).toBeNull();
    expect(await prisma.oplRosterMatch.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("leaves a link alone that was unlinked and linked again during the call", async () => {
    const opl = fakeOpl();
    const user = await linkedUser(opl);
    await makeOnlyDue({ userId: user.id });
    const relinked = new Date(NOW.getTime() + 5 * 60_000);
    const slow: OplApi = {
      ...opl.api,
      async user(id) {
        await unlinkOplUser({ userId: user.id });
        await linkOplUser({
          userId: user.id,
          url: `https://www.opleague.pro/user/${id}`,
          opl: opl.api,
          now: relinked,
        });
        opl.users.set(id, "111111111111111111");
        return opl.api.user(id);
      },
    };
    await oplTick({ now: DAY_LATER, opl: slow });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      oplUserId: user.oplUserId,
      oplLinkedAt: relinked,
    });
  });
});

describe("data export (§5.10)", () => {
  it("names the own OPL profile and the team's link with whether the person is in the roster", async () => {
    const { exportAccountData } = await import("../src/index.ts");
    const opl = fakeOpl();
    const { team, captain } = await createTeamWithMembers();
    const linked = await linkedUser(opl, captain);
    const id = oplId();
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [
        { oplUserId: linked.oplUserId, discordId: captain.discordId },
        { oplUserId: oplId(), discordId: null },
      ],
    });
    await linkOplTeam({
      userId: captain.id,
      teamId: team.id,
      url: `https://www.opleague.pro/team/${id}`,
      opl: opl.api,
      now: NOW,
    });
    const data = await exportAccountData({
      userId: captain.id,
      now: LATER,
      privacyPolicyUrl: "https://example.test/datenschutz",
      uploadDir: "/tmp/uni-scrims-test-none",
    });
    expect(data.konto.opl).toMatchObject({
      profilId: linked.oplUserId,
      verknüpftAm: NOW,
      gelöschtGemeldet: 0,
    });
    expect(data.teams[0]!.opl).toMatchObject({
      teamId: id,
      verknüpftAm: NOW,
      imKader: true,
      weitereImKader: 1,
    });
  });
});

describe("deleting an account", () => {
  it("clears the own link and the matches", async () => {
    const { deleteAccount } = await import("../src/index.ts");
    const opl = fakeOpl();
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const linked = await linkedUser(opl, captain);
    const member = await linkedUser(opl, members[0]!);
    const id = oplId();
    opl.teams.set(id, {
      name: "T",
      shortName: null,
      members: [
        { oplUserId: linked.oplUserId, discordId: captain.discordId },
        { oplUserId: member.oplUserId, discordId: member.discordId },
      ],
    });
    await linkOplTeam({
      userId: captain.id,
      teamId: team.id,
      url: `https://www.opleague.pro/team/${id}`,
      opl: opl.api,
      now: NOW,
    });
    await deleteAccount({ userId: member.id, uploadDir: "/tmp/uni-scrims-test-none", now: LATER });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({
      oplUserId: null,
    });
    expect(await prisma.oplRosterMatch.count({ where: { userId: member.id } })).toBe(0);
    expect((await getMyTeam(captain.id))!.opl).toMatchObject({
      matches: [{ id: captain.id }],
      others: 1,
    });
  });
});
