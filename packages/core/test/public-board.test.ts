import {
  LogoBackground,
  Rank,
  RequestStatus,
  ScrimFormat,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import { getPublicBoard, getPublicTeamLogo } from "../src/index.ts";
import {
  NOW,
  REQUEST_STARTS_AT,
  bookScrim,
  createFullyVerifiedTeam,
  createOpenRequest,
  createTeamWithMembers,
} from "./helpers.ts";

// Phase 28 (SPEC N-24, §5.26): the board without login and the logos it shows.

afterAll(async () => {
  await prisma.$disconnect();
});

const HOUR = 60 * 60 * 1000;
const { DARK, LIGHT } = LogoBackground;

type Board = Awaited<ReturnType<typeof getPublicBoard>>;
const ids = (board: Board) => board.requests.map((request) => request.id);

/** A no-show of `team` as guest of a fresh host, a day before NOW: the team is not reliable. */
async function noShow(team: Awaited<ReturnType<typeof createTeamWithMembers>>) {
  const host = await createTeamWithMembers();
  const startsAt = new Date(NOW.getTime() - 24 * HOUR);
  const request = await prisma.scrimRequest.create({
    data: {
      teamId: host.team.id,
      createdById: host.captain.id,
      startsAt,
      format: ScrimFormat.ONE_MAP,
      rankMin: Rank.IRON,
      rankMax: Rank.RADIANT,
      maps: [],
      status: RequestStatus.BOOKED,
      createdAt: new Date(startsAt.getTime() - 72 * HOUR),
    },
  });
  await prisma.scrim.create({
    data: {
      requestId: request.id,
      hostTeamId: host.team.id,
      guestTeamId: team.team.id,
      startsAt,
      format: ScrimFormat.ONE_MAP,
      maps: [],
      feedbackOpensAt: new Date(startsAt.getTime() + 3 * HOUR),
      feedbackDeadline: new Date(startsAt.getTime() + 75 * HOUR),
      status: ScrimStatus.NO_SHOW,
      noShowTeamId: team.team.id,
      createdAt: new Date(startsAt.getTime() - 48 * HOUR),
    },
  });
}

/** A stored logo for dark backgrounds, written directly (processing is tested in team-logo). */
async function addLogo(teamId: string) {
  await prisma.teamLogo.create({
    data: { teamId, background: DARK, data: new Uint8Array([1, 2, 3]) },
  });
  await prisma.team.update({ where: { id: teamId }, data: { logoUpdatedAt: NOW } });
}

describe("getPublicBoard", () => {
  it("shows open future requests of active teams without a user, hidden teams included", async () => {
    const author = await createFullyVerifiedTeam();
    const request = await createOpenRequest(author.captain.id);
    const hidden = await createTeamWithMembers();
    await prisma.team.update({ where: { id: hidden.team.id }, data: { listed: false } });
    const hiddenRequest = await createOpenRequest(hidden.captain.id);

    const board = await getPublicBoard({ now: NOW });
    expect(ids(board)).toEqual(expect.arrayContaining([request.id, hiddenRequest.id]));
    expect(board.requests.find((card) => card.id === request.id)).toEqual({
      id: request.id,
      startsAt: REQUEST_STARTS_AT,
      format: ScrimFormat.ONE_MAP,
      rankMin: Rank.SILVER,
      rankMax: Rank.PLATINUM,
      maps: [],
      applicationCount: 0,
      team: {
        id: author.team.id,
        name: author.team.name,
        tag: author.team.tag,
        rank: Rank.GOLD,
        logo: null,
        universities: { shown: [], more: 0 },
        reliability: { played: 0, noShows: 0, lateCancels: 0, avgRating: null },
        fullyVerified: true,
      },
      verifiedApplicantsOnly: false,
    });
    // Started requests are no longer on the board.
    expect(ids(await getPublicBoard({ now: REQUEST_STARTS_AT }))).not.toContain(request.id);
  });

  it("hides requests of banned and dissolved teams and booked requests", async () => {
    const banned = await createTeamWithMembers();
    const bannedRequest = await createOpenRequest(banned.captain.id);
    await prisma.team.update({ where: { id: banned.team.id }, data: { bannedAt: NOW } });
    const dissolved = await createTeamWithMembers();
    const dissolvedRequest = await createOpenRequest(dissolved.captain.id);
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });
    const { request: booked } = await bookScrim();

    const board = ids(await getPublicBoard({ now: NOW }));
    expect(board).not.toContain(bannedRequest.id);
    expect(board).not.toContain(dissolvedRequest.id);
    expect(board).not.toContain(booked.id);
  });

  it("has no rank default and filters by ranks and the Berlin date", async () => {
    const author = await createTeamWithMembers();
    const gold = await createOpenRequest(author.captain.id);
    const high = await createOpenRequest(author.captain.id, {
      rankMin: Rank.DIAMOND,
      rankMax: Rank.IMMORTAL,
    });
    const night = await createOpenRequest(author.captain.id, { date: "2026-10-23", time: "01:00" });

    for (const ranks of [undefined, [], "ALL"] as const) {
      const board = await getPublicBoard({ ranks, now: NOW });
      expect(board.filter.ranks).toEqual([]);
      expect(ids(board)).toEqual(expect.arrayContaining([gold.id, high.id, night.id]));
    }
    const diamond = await getPublicBoard({ ranks: [Rank.IMMORTAL, Rank.DIAMOND], now: NOW });
    expect(diamond.filter.ranks).toEqual([Rank.DIAMOND, Rank.IMMORTAL]);
    expect(ids(diamond)).toContain(high.id);
    expect(ids(diamond)).not.toContain(gold.id);

    const day = await getPublicBoard({ date: "2026-10-23", now: NOW });
    expect(day.filter.date).toBe("2026-10-23");
    expect(ids(day)).toContain(night.id);
    expect(ids(day)).not.toContain(gold.id);
    expect((await getPublicBoard({ date: "kaputt", now: NOW })).filter.date).toBeNull();
  });

  it("filters by the badge and by reliability", async () => {
    const verified = await createFullyVerifiedTeam();
    const captainOnly = await createTeamWithMembers();
    const unreliable = await createTeamWithMembers();
    await noShow(unreliable);
    const requests = await Promise.all(
      [verified, captainOnly, unreliable].map((team) => createOpenRequest(team.captain.id)),
    );
    const ours = new Set(requests.map((request) => request.id));
    const teams = async (input: { fullyVerifiedOnly?: boolean; reliableOnly?: boolean }) => {
      const board = await getPublicBoard({ ...input, now: NOW });
      return {
        filter: board.filter,
        teams: new Set(
          board.requests.filter((card) => ours.has(card.id)).map((card) => card.team.id),
        ),
      };
    };

    const all = await teams({});
    expect(all.filter).toMatchObject({ fullyVerifiedOnly: false, reliableOnly: false });
    expect(all.teams).toEqual(new Set([verified.team.id, captainOnly.team.id, unreliable.team.id]));
    const badge = await teams({ fullyVerifiedOnly: true });
    expect(badge.filter.fullyVerifiedOnly).toBe(true);
    expect(badge.teams).toEqual(new Set([verified.team.id]));
    const reliable = await teams({ reliableOnly: true });
    expect(reliable.filter.reliableOnly).toBe(true);
    expect(reliable.teams).toEqual(new Set([verified.team.id, captainOnly.team.id]));
  });
});

describe("getPublicTeamLogo", () => {
  it("serves the logo only while the team has an open request", async () => {
    const { team, captain } = await createTeamWithMembers();
    await addLogo(team.id);
    const fetch = (background: LogoBackground, now = NOW) =>
      getPublicTeamLogo({ teamId: team.id, background, now });

    await expect(fetch(DARK)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await createOpenRequest(captain.id);
    expect(await fetch(DARK)).toEqual({ data: new Uint8Array([1, 2, 3]), version: NOW.getTime() });
    // No logo for this background, and none once the request has started.
    await expect(fetch(LIGHT)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(fetch(DARK, REQUEST_STARTS_AT)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      getPublicTeamLogo({ teamId: team.id, background: "BLUE" as LogoBackground, now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("serves no logos of banned or dissolved teams, even with an open request", async () => {
    for (const data of [{ bannedAt: NOW }, { dissolvedAt: NOW }]) {
      const { team, captain } = await createTeamWithMembers();
      await addLogo(team.id);
      await createOpenRequest(captain.id);
      await prisma.team.update({ where: { id: team.id }, data });
      await expect(
        getPublicTeamLogo({ teamId: team.id, background: DARK, now: NOW }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });
});
