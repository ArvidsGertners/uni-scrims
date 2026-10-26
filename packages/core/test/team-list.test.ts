import { MemberRole, Rank, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import { TEAM_SEARCH_MAX, getMyTeam, getTeamList, setTeamListed } from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser } from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Five letters from g–z: never part of the hex IDs in the names of other test teams, so a search
 * for it finds only the teams of one test (the test DB is reset once per run).
 */
function token(): string {
  const letters = "ghijklmnopqrstuvwxyz";
  return Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * 20)]).join("");
}

async function rename(teamId: string, name: string) {
  await prisma.team.update({
    where: { id: teamId },
    data: { name, nameNormalized: name.toLowerCase() },
  });
}

async function setMember(
  teamId: string,
  userId: string,
  data: { role?: MemberRole; joinedAt?: Date },
) {
  await prisma.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data });
}

const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

async function list(search: string, ranks?: Rank[] | "ALL") {
  const viewer = await createUser();
  return getTeamList({ now: NOW, userId: viewer.id, search, ranks });
}

describe("getTeamList (§5.23)", () => {
  it("shows a team with the universities of its verified members, its rank and all members", async () => {
    const tok = token();
    const university = await prisma.university.create({
      data: { name: `Uni ${tok} Nord`, city: "Teststadt", slug: `uni-${tok}` },
    });
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 3,
      rank: null,
    });
    const [player, substitute, coach] = members as [
      (typeof members)[0],
      (typeof members)[0],
      (typeof members)[0],
    ];
    await rename(team.id, `${tok} Eagles`);
    await prisma.user.update({
      where: { id: captain.id },
      data: { rank: Rank.GOLD, universityOther: `Hochschule ${tok}` },
    });
    await prisma.user.update({
      where: { id: player.id },
      data: { rank: Rank.PLATINUM, universityId: university.id },
    });
    // Unverified: the rank counts, the university does not (SPEC N-16, P0-3).
    await prisma.user.update({
      where: { id: substitute.id },
      data: { rank: Rank.DIAMOND, verifiedAt: null, universityOther: `Geheim ${tok}` },
    });
    // Coaches never count for the team rank.
    await prisma.user.update({ where: { id: coach.id }, data: { rank: Rank.IRON } });
    await setMember(team.id, player.id, { joinedAt: later(1) });
    await setMember(team.id, substitute.id, { role: MemberRole.SUBSTITUTE, joinedAt: later(2) });
    await setMember(team.id, coach.id, { role: MemberRole.COACH, joinedAt: later(3) });

    const result = await list(tok);
    expect(result.teams).toEqual([
      {
        id: team.id,
        name: `${tok} Eagles`,
        tag: "TST",
        // Gold, Platinum and Diamond: Platinum on average.
        rank: Rank.PLATINUM,
        logo: null,
        universities: { shown: [`Hochschule ${tok}`, `Uni ${tok} Nord`], more: 0 },
        // Only captain and player count as verified players, so no badge (SPEC N-21).
        fullyVerified: false,
        // No scrims in the last 90 days (SPEC N-23).
        reliability: { played: 0, noShows: 0, lateCancels: 0, avgRating: null },
        members: [
          {
            id: captain.id,
            name: captain.name,
            role: MemberRole.PLAYER,
            isCaptain: true,
            rank: Rank.GOLD,
          },
          {
            id: player.id,
            name: player.name,
            role: MemberRole.PLAYER,
            isCaptain: false,
            rank: Rank.PLATINUM,
          },
          {
            id: substitute.id,
            name: substitute.name,
            role: MemberRole.SUBSTITUTE,
            isCaptain: false,
            rank: Rank.DIAMOND,
          },
          {
            id: coach.id,
            name: coach.name,
            role: MemberRole.COACH,
            isCaptain: false,
            rank: Rank.IRON,
          },
        ],
        // The viewer has no team, so no direct request (SPEC N-26).
        canRequest: false,
      },
    ]);
    expect(result.filter).toEqual({
      search: tok,
      ranks: [],
      fullyVerifiedOnly: false,
      reliableOnly: false,
    });
  });

  it("leaves out banned, dissolved and hidden teams, also for their members", async () => {
    const tok = token();
    const shown = await createTeamWithMembers();
    const banned = await createTeamWithMembers({ banned: true });
    const dissolved = await createTeamWithMembers();
    const hidden = await createTeamWithMembers();
    await rename(shown.team.id, `${tok} Shown`);
    await rename(banned.team.id, `${tok} Banned`);
    await rename(dissolved.team.id, `${tok} Dissolved`);
    await rename(hidden.team.id, `${tok} Hidden`);
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });
    await prisma.team.update({ where: { id: hidden.team.id }, data: { listed: false } });

    expect((await list(tok)).teams.map((team) => team.id)).toEqual([shown.team.id]);
    const own = await getTeamList({ now: NOW, userId: hidden.captain.id, search: tok });
    expect(own.teams.map((team) => team.id)).toEqual([shown.team.id]);
  });

  it("searches names, tags and all universities of verified members, ignoring case", async () => {
    const tok = token();
    const byName = await createTeamWithMembers();
    const byTag = await createTeamWithMembers();
    const byUniversity = await createTeamWithMembers({ extraMembers: 4 });
    await rename(byName.team.id, `Die ${tok.toUpperCase()}s`);
    await prisma.team.update({ where: { id: byTag.team.id }, data: { tag: tok.toUpperCase() } });
    // Four universities: the card shows three, the search finds the fourth too.
    const universities = ["Alpha", "Beta", "Delta", "Gamma", "Zeta"];
    const people = [byUniversity.captain, ...byUniversity.members];
    for (const [index, person] of people.entries()) {
      await prisma.user.update({
        where: { id: person.id },
        data: { universityOther: `${universities[index]} ${tok}` },
      });
    }

    const all = await list(tok);
    expect(all.teams.map((team) => team.id).sort()).toEqual(
      [byName.team.id, byTag.team.id, byUniversity.team.id].sort(),
    );
    const found = await list(`ZETA ${tok}`);
    expect(found.teams.map((team) => team.id)).toEqual([byUniversity.team.id]);
    expect(found.teams[0]!.universities).toEqual({
      shown: [`Alpha ${tok}`, `Beta ${tok}`, `Delta ${tok}`],
      more: 2,
    });

    // The university of an unverified member is not shown, so it is not searched either.
    await prisma.user.update({ where: { id: people[4]!.id }, data: { verifiedAt: null } });
    expect((await list(`zeta ${tok}`)).teams).toEqual([]);
  });

  it("filters by team rank; teams without one only without a rank filter", async () => {
    const tok = token();
    const gold = await createTeamWithMembers({ rank: Rank.GOLD });
    const diamond = await createTeamWithMembers({ rank: Rank.DIAMOND });
    const unranked = await createTeamWithMembers({ rank: null });
    await rename(gold.team.id, `${tok} b Gold`);
    await rename(diamond.team.id, `${tok} A Diamond`);
    await rename(unranked.team.id, `${tok} c None`);

    const names = async (ranks?: Rank[] | "ALL") =>
      (await list(tok, ranks)).teams.map((team) => team.name);
    // Sorted by name, without regard to case.
    expect(await names()).toEqual([`${tok} A Diamond`, `${tok} b Gold`, `${tok} c None`]);
    expect(await names("ALL")).toEqual(await names());
    expect(await names([])).toEqual(await names());
    expect(await names([Rank.GOLD])).toEqual([`${tok} b Gold`]);
    expect(await names([Rank.DIAMOND, Rank.GOLD])).toEqual([`${tok} A Diamond`, `${tok} b Gold`]);
    expect(await names([Rank.RADIANT])).toEqual([]);

    // The applied filter in rank order, without duplicates.
    const result = await list(tok, [Rank.DIAMOND, Rank.GOLD, Rank.GOLD]);
    expect(result.filter.ranks).toEqual([Rank.GOLD, Rank.DIAMOND]);
  });

  it("trims the search and cuts it to the maximum length", async () => {
    const viewer = await createUser();
    const trimmed = await getTeamList({ now: NOW, userId: viewer.id, search: "  abc  " });
    expect(trimmed.filter.search).toBe("abc");
    const long = await getTeamList({
      now: NOW,
      userId: viewer.id,
      search: "x".repeat(TEAM_SEARCH_MAX + 50),
    });
    expect(long.filter.search).toHaveLength(TEAM_SEARCH_MAX);
    const none = await getTeamList({ now: NOW, userId: viewer.id, search: "   " });
    expect(none.filter.search).toBe("");
    // Cut by code points: no half emoji at the end, and no trailing space.
    const emoji = await getTeamList({
      now: NOW,
      userId: viewer.id,
      search: "x".repeat(TEAM_SEARCH_MAX - 1) + "😀y",
    });
    expect(emoji.filter.search).toBe("x".repeat(TEAM_SEARCH_MAX - 1) + "😀");
    const space = await getTeamList({
      now: NOW,
      userId: viewer.id,
      search: "x".repeat(TEAM_SEARCH_MAX - 1) + " y",
    });
    expect(space.filter.search).toBe("x".repeat(TEAM_SEARCH_MAX - 1));
  });

  it("is for active, complete accounts, verified or not", async () => {
    await expect(
      getTeamList({ now: NOW, userId: (await createUser()).id, search: token() }),
    ).resolves.toMatchObject({ teams: [] });
    await expect(
      getTeamList({ now: NOW, userId: (await createUser({ banned: true })).id }),
    ).rejects.toMatchObject({ code: "BANNED" });
    await expect(
      getTeamList({ now: NOW, userId: (await createUser({ legacy: true })).id }),
    ).rejects.toMatchObject({ code: "ACCOUNT_INCOMPLETE" });
  });
});

describe("setTeamListed (§5.23)", () => {
  it("lets the captain hide the team and show it again", async () => {
    const tok = token();
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await rename(team.id, `${tok} Toggle`);
    expect((await getMyTeam(members[0]!.id))?.listed).toBe(true);

    await setTeamListed({ userId: captain.id, teamId: team.id, listed: false });
    expect((await list(tok)).teams).toEqual([]);
    expect((await getMyTeam(members[0]!.id))?.listed).toBe(false);
    // The same value again changes nothing.
    await setTeamListed({ userId: captain.id, teamId: team.id, listed: false });

    await setTeamListed({ userId: captain.id, teamId: team.id, listed: true });
    expect((await list(tok)).teams.map((entry) => entry.id)).toEqual([team.id]);
  });

  it("rejects members, other captains, banned teams and invalid values", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 1,
      verifiedCaptain: false,
    });
    const hide = (userId: string) => setTeamListed({ userId, teamId: team.id, listed: false });

    await expect(hide(members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createTeamWithMembers();
    await expect(hide(other.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setTeamListed({ userId: captain.id, teamId: team.id, listed: "no" as unknown as boolean }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(hide(captain.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Das Team ist gesperrt.",
    });
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(row.listed).toBe(true);
    // The ban keeps the captain's choice, but the team is not on the list (SPEC N-20).
    expect((await getMyTeam(members[0]!.id))?.listed).toBe(false);
  });

  it("needs no verification of the captain", async () => {
    const { team, captain } = await createTeamWithMembers({ verifiedCaptain: false });
    await setTeamListed({ userId: captain.id, teamId: team.id, listed: false });
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(row.listed).toBe(false);
  });
});
