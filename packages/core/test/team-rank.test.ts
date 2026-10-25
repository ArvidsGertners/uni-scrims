import { MemberRole, Rank, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  applyToRequest,
  deleteAccount,
  getAccount,
  getBoard,
  getMyTeam,
  getRequestDetail,
  getRequestForm,
  getTeamByInviteCode,
  setMemberRole,
  setPlayerRank,
  teamRankSummary,
} from "../src/index.ts";
import {
  NOW,
  createOpenRequest,
  createReadyTeam,
  createTeamWithMembers,
  createUser,
} from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

const member = (role: MemberRole, rank: Rank | null) => ({ role, user: { rank } });
const { PLAYER, SUBSTITUTE, COACH } = MemberRole;

describe("teamRankSummary", () => {
  it("averages players and substitutes, rounding half up", () => {
    expect(teamRankSummary([member(PLAYER, Rank.GOLD), member(SUBSTITUTE, Rank.PLATINUM)])).toEqual(
      { rank: Rank.PLATINUM, rankedCount: 2 },
    );
    expect(
      teamRankSummary([
        member(PLAYER, Rank.GOLD),
        member(PLAYER, Rank.GOLD),
        member(PLAYER, Rank.PLATINUM),
      ]),
    ).toEqual({ rank: Rank.GOLD, rankedCount: 3 });
    expect(teamRankSummary([member(PLAYER, Rank.IRON), member(PLAYER, Rank.RADIANT)]).rank).toBe(
      Rank.PLATINUM,
    );
  });

  it("leaves out coaches and members without a rank", () => {
    expect(
      teamRankSummary([
        member(PLAYER, Rank.SILVER),
        member(PLAYER, null),
        member(COACH, Rank.RADIANT),
      ]),
    ).toEqual({ rank: Rank.SILVER, rankedCount: 1 });
    expect(teamRankSummary([member(COACH, Rank.GOLD), member(PLAYER, null)])).toEqual({
      rank: null,
      rankedCount: 0,
    });
    expect(teamRankSummary([])).toEqual({ rank: null, rankedCount: 0 });
  });
});

describe("setPlayerRank", () => {
  it("sets and clears the own rank", async () => {
    const user = await createUser();
    await setPlayerRank({ userId: user.id, rank: "DIAMOND" });
    expect((await getAccount(user.id)).rank).toBe(Rank.DIAMOND);
    await setPlayerRank({ userId: user.id, rank: "" });
    expect((await getAccount(user.id)).rank).toBeNull();
  });

  it("rejects unknown ranks, banned, incomplete and deleted accounts", async () => {
    const user = await createUser({ rank: Rank.GOLD });
    await expect(setPlayerRank({ userId: user.id, rank: "CAPTAIN" })).rejects.toMatchObject({
      code: "INVALID",
    });
    const banned = await createUser({ banned: true });
    await expect(setPlayerRank({ userId: banned.id, rank: "GOLD" })).rejects.toMatchObject({
      code: "BANNED",
    });
    const legacy = await createUser({ legacy: true });
    await expect(setPlayerRank({ userId: legacy.id, rank: "GOLD" })).rejects.toMatchObject({
      code: "ACCOUNT_INCOMPLETE",
    });
    await deleteAccount({ userId: user.id, uploadDir: "/nonexistent", now: NOW });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).rank).toBeNull();
    await expect(setPlayerRank({ userId: user.id, rank: "GOLD" })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});

describe("computed team rank", () => {
  it("shows the own team its rank, how many ranks it is made of and each member's rank", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 3,
      rank: null,
    });
    expect(await getMyTeam(captain.id)).toMatchObject({ rank: null, rankedCount: 0 });

    await setPlayerRank({ userId: captain.id, rank: "GOLD" });
    await setPlayerRank({ userId: members[0]!.id, rank: "PLATINUM" });
    await setPlayerRank({ userId: members[1]!.id, rank: "RADIANT" });
    // A coach's rank never counts.
    await setMemberRole({
      userId: captain.id,
      teamId: team.id,
      memberId: members[1]!.id,
      role: COACH,
    });
    const own = await getMyTeam(members[2]!.id);
    expect(own).toMatchObject({ rank: Rank.PLATINUM, rankedCount: 2 });
    expect(Object.fromEntries(own!.members.map((m) => [m.id, m.rank]))).toEqual({
      [captain.id]: Rank.GOLD,
      [members[0]!.id]: Rank.PLATINUM,
      [members[1]!.id]: Rank.RADIANT,
      [members[2]!.id]: null,
    });
    // Others see the computed rank only.
    const viewer = await createUser();
    expect(await getTeamByInviteCode(viewer.id, team.inviteCode!)).toMatchObject({
      rank: Rank.PLATINUM,
    });
    expect(await getTeamByInviteCode(viewer.id, team.inviteCode!)).not.toHaveProperty("members");
  });

  it("filters the board by the own rank, and not at all without one", async () => {
    const author = await createReadyTeam({ rank: Rank.DIAMOND });
    const low = await createOpenRequest(author.captain.id, {
      rankMin: Rank.IRON,
      rankMax: Rank.BRONZE,
    });
    const board = async (userId: string) =>
      (await getBoard({ userId, now: NOW })).requests.some((request) => request.id === low.id);

    const ranked = await createReadyTeam({ rank: Rank.GOLD });
    expect(await board(ranked.captain.id)).toBe(false);
    expect((await getBoard({ userId: ranked.captain.id, now: NOW })).ownTeam?.rank).toBe(Rank.GOLD);

    const unranked = await createReadyTeam({ rank: null });
    expect(await board(unranked.captain.id)).toBe(true);
    expect(await getBoard({ userId: unranked.captain.id, now: NOW })).toMatchObject({
      ownTeam: { rank: null },
      filter: { ranks: [] },
    });
    // The board card of the author shows its computed rank.
    const card = (await getBoard({ userId: unranked.captain.id, now: NOW })).requests.find(
      (request) => request.id === low.id,
    );
    expect(card?.team.rank).toBe(Rank.DIAMOND);
  });

  it("starts a new request without a team rank at no rank, and gives no out-of-range hint", async () => {
    const unranked = await createReadyTeam({ rank: null });
    expect(await getRequestForm({ userId: unranked.captain.id, now: NOW })).toMatchObject({
      rank: null,
    });

    const author = await createReadyTeam({ rank: Rank.DIAMOND });
    const request = await createOpenRequest(author.captain.id, {
      rankMin: Rank.DIAMOND,
      rankMax: Rank.RADIANT,
    });
    const detail = async (userId: string) =>
      getRequestDetail({ userId, requestId: request.id, now: NOW });
    expect((await detail(unranked.captain.id))?.outOfRange).toBe(false);
    const { outOfRange } = await applyToRequest({
      userId: unranked.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(outOfRange).toBe(false);
    expect((await detail(author.captain.id))?.applications?.[0]).toMatchObject({
      outOfRange: false,
      team: { rank: null },
    });

    // With a rank outside the range, the hints are there as before.
    const low = await createReadyTeam({ rank: Rank.IRON });
    expect((await detail(low.captain.id))?.outOfRange).toBe(true);
    expect(
      (await applyToRequest({ userId: low.captain.id, requestId: request.id, now: NOW }))
        .outOfRange,
    ).toBe(true);
  });
});
