import {
  LogoBackground,
  Rank,
  RequestStatus,
  ScrimFormat,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { LANDING_SHOWCASE_MAX } from "../config/limits.ts";
import {
  answerShowcaseQuestion,
  createTeam,
  getLandingShowcase,
  getMyTeam,
  getNavTeam,
  getPublicTeamLogo,
  pendingShowcaseQuestion,
  setTeamShowcase,
} from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser, uid } from "./helpers.ts";

// Phase 38 (SPEC N-34, §5.36): teams on the landing page with the captain's consent.

afterAll(async () => {
  await prisma.$disconnect();
});

// Other test files leave teams behind; only the teams of each test are on the landing page.
beforeEach(async () => {
  await prisma.team.updateMany({ where: { showOnLanding: true }, data: { showOnLanding: false } });
});

const DAY = 24 * 60 * 60 * 1000;

type Team = Awaited<ReturnType<typeof createTeamWithMembers>>;

async function showcaseTeam(options: Parameters<typeof createTeamWithMembers>[0] = {}) {
  const team = await createTeamWithMembers(options);
  await prisma.team.update({ where: { id: team.team.id }, data: { showOnLanding: true } });
  return team;
}

async function addLogo(teamId: string) {
  await prisma.teamLogo.create({
    data: { teamId, background: LogoBackground.DARK, data: new Uint8Array([1, 2, 3]) },
  });
  await prisma.team.update({ where: { id: teamId }, data: { logoUpdatedAt: NOW } });
}

/** A completed scrim of `team` against a fresh host that started `daysAgo` days before NOW. */
async function playedScrim(team: Team, daysAgo: number) {
  const host = await createTeamWithMembers();
  const startsAt = new Date(NOW.getTime() - daysAgo * DAY);
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
      createdAt: new Date(startsAt.getTime() - 3 * DAY),
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
      feedbackOpensAt: new Date(startsAt.getTime() + DAY / 8),
      feedbackDeadline: new Date(startsAt.getTime() + 3 * DAY),
      status: ScrimStatus.COMPLETED,
      createdAt: request.createdAt,
    },
  });
}

async function rename(teamId: string, name: string) {
  await prisma.team.update({ where: { id: teamId }, data: { name, nameNormalized: name } });
}

const ids = async () => (await getLandingShowcase(NOW)).teams.map((team) => team.id);

describe("getLandingShowcase", () => {
  it("shows only consenting teams that are listed and active", async () => {
    const shown = await showcaseTeam();
    await createTeamWithMembers(); // not asked yet
    const declined = await createTeamWithMembers();
    await prisma.team.update({ where: { id: declined.team.id }, data: { showOnLanding: false } });
    const hidden = await showcaseTeam();
    await prisma.team.update({ where: { id: hidden.team.id }, data: { listed: false } });
    await showcaseTeam({ banned: true });
    const dissolved = await showcaseTeam();
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });

    expect(await ids()).toEqual([shown.team.id]);
  });

  // Phase 41 (SPEC N-37): other active teams only as a count. Test files run one after another, so
  // the count changes only by what each test creates.
  it("counts the other active teams, hidden and unasked ones too, but not banned or dissolved", async () => {
    const before = (await getLandingShowcase(NOW)).others;
    await showcaseTeam();
    await createTeamWithMembers(); // not asked yet
    const declined = await createTeamWithMembers();
    await prisma.team.update({ where: { id: declined.team.id }, data: { showOnLanding: false } });
    const hidden = await showcaseTeam();
    await prisma.team.update({ where: { id: hidden.team.id }, data: { listed: false } });
    await showcaseTeam({ banned: true });
    const dissolved = await createTeamWithMembers();
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });

    const showcase = await getLandingShowcase(NOW);
    expect(showcase.teams).toHaveLength(1);
    // Not asked, declined and hidden: three more; the shown one is not among the others.
    expect(showcase.others).toBe(before + 3);
  });

  it("counts consenting teams beyond the limit as others", async () => {
    const before = (await getLandingShowcase(NOW)).others;
    for (let i = 0; i < LANDING_SHOWCASE_MAX + 2; i++) await showcaseTeam();

    const showcase = await getLandingShowcase(NOW);
    expect(showcase.teams).toHaveLength(LANDING_SHOWCASE_MAX);
    expect(showcase.others).toBe(before + 2);
  });

  it("has only the count when no captain agreed", async () => {
    await createTeamWithMembers();
    const showcase = await getLandingShowcase(NOW);
    expect(showcase.teams).toEqual([]);
    expect(showcase.others).toBeGreaterThan(0);
  });

  it("returns rank, universities and reliability but no members", async () => {
    const team = await showcaseTeam({ extraMembers: 1 });
    const university = await prisma.university.create({
      data: { name: "Uni Startseite", city: "Teststadt", slug: `uni-startseite-${uid()}` },
    });
    await prisma.user.update({
      where: { id: team.captain.id },
      data: { universityId: university.id },
    });
    await playedScrim(team, 3);

    const [entry] = (await getLandingShowcase(NOW)).teams;
    expect(entry).toEqual({
      id: team.team.id,
      name: team.team.name,
      tag: "TST",
      logo: null,
      universities: { shown: ["Uni Startseite"], more: 0 },
      rank: Rank.GOLD,
      reliability: { played: 1, noShows: 0, lateCancels: 0, avgRating: null },
    });
    expect(JSON.stringify(entry)).not.toContain(team.captain.name);
  });

  it("puts teams with a logo first, then the most scrims of the last 90 days, then the name", async () => {
    const [a, b, c, d] = [
      await showcaseTeam(),
      await showcaseTeam(),
      await showcaseTeam(),
      await showcaseTeam(),
    ];
    await rename(a!.team.id, "Showcase A");
    await rename(b!.team.id, "Showcase B");
    await rename(c!.team.id, "Showcase C");
    await rename(d!.team.id, "Showcase D");
    // D has a logo but no scrims; B two recent scrims; A one; C one recent and two too old.
    await addLogo(d!.team.id);
    await playedScrim(b!, 1);
    await playedScrim(b!, 10);
    await playedScrim(a!, 5);
    await playedScrim(c!, 5);
    await playedScrim(c!, 91);
    await playedScrim(c!, 120);

    expect(await ids()).toEqual([d!.team.id, b!.team.id, a!.team.id, c!.team.id]);
  });

  it(`shows at most ${LANDING_SHOWCASE_MAX} teams`, async () => {
    for (let i = 0; i <= LANDING_SHOWCASE_MAX; i++) await showcaseTeam();
    expect(await ids()).toHaveLength(LANDING_SHOWCASE_MAX);
  });
});

describe("getPublicTeamLogo for the landing page", () => {
  it("serves the logo of a consenting listed team, until it is turned off or hidden", async () => {
    const { team, captain } = await showcaseTeam();
    await addLogo(team.id);
    const fetch = () =>
      getPublicTeamLogo({ teamId: team.id, background: LogoBackground.DARK, now: NOW });

    expect(await fetch()).toEqual({ data: new Uint8Array([1, 2, 3]), version: NOW.getTime() });
    await prisma.team.update({ where: { id: team.id }, data: { listed: false } });
    await expect(fetch()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.team.update({ where: { id: team.id }, data: { listed: true } });
    await setTeamShowcase({ userId: captain.id, teamId: team.id, show: false });
    await expect(fetch()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.team.update({
      where: { id: team.id },
      data: { showOnLanding: true, bannedAt: NOW },
    });
    await expect(fetch()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("createTeam with showOnLanding", () => {
  it("stores the choice, off by default, so new teams are never asked", async () => {
    const off = await createUser();
    const on = await createUser();
    const offTeam = await createTeam({
      userId: off.id,
      name: `Off ${uid()}`,
      tag: "OFF",
      now: NOW,
    });
    const onTeam = await createTeam({
      userId: on.id,
      name: `On ${uid()}`,
      tag: "ON",
      now: NOW,
      showOnLanding: true,
    });
    expect(offTeam.showOnLanding).toBe(false);
    expect(onTeam.showOnLanding).toBe(true);
    expect(await pendingShowcaseQuestion(off.id)).toEqual([]);
    expect(await ids()).toEqual([onTeam.id]);
    await expect(
      createTeam({
        userId: off.id,
        name: `Bad ${uid()}`,
        tag: "BAD",
        now: NOW,
        showOnLanding: "yes" as unknown as boolean,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });
});

describe("setTeamShowcase", () => {
  it("lets the captain turn it on and off; the team page shows both values", async () => {
    const { team, captain, members } = await createTeamWithMembers({
      extraMembers: 1,
      verifiedCaptain: false,
    });
    await setTeamShowcase({ userId: captain.id, teamId: team.id, show: true });
    expect(await getMyTeam(members[0]!.id)).toMatchObject({
      showOnLanding: true,
      landingEligible: true,
    });
    expect(await ids()).toEqual([team.id]);

    // Hidden from the teams list: the choice stays, but the team is not shown.
    await prisma.team.update({ where: { id: team.id }, data: { listed: false } });
    expect(await getMyTeam(captain.id)).toMatchObject({
      showOnLanding: true,
      landingEligible: false,
    });

    await setTeamShowcase({ userId: captain.id, teamId: team.id, show: false });
    expect(await getMyTeam(captain.id)).toMatchObject({
      showOnLanding: false,
      landingEligible: false,
    });
  });

  it("rejects members, other captains, banned teams and invalid values", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    const turnOn = (userId: string) => setTeamShowcase({ userId, teamId: team.id, show: true });
    await expect(turnOn(members[0]!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await createTeamWithMembers();
    await expect(turnOn(other.captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setTeamShowcase({ userId: captain.id, teamId: team.id, show: 1 as unknown as boolean }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await prisma.team.update({ where: { id: team.id }, data: { bannedAt: NOW } });
    await expect(turnOn(captain.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    expect(row.showOnLanding).toBeNull();
  });
});

describe("the one-time question", () => {
  it("asks the captain about each own active team not asked yet, hidden ones included", async () => {
    const first = await createTeamWithMembers();
    const captain = first.captain;
    const second = await createTeamWithMembers();
    await prisma.team.update({
      where: { id: second.team.id },
      data: { captainId: captain.id, listed: false },
    });
    await prisma.teamMember.create({
      data: { teamId: second.team.id, userId: captain.id, joinedAt: NOW },
    });
    await rename(first.team.id, "Frage B");
    await rename(second.team.id, "Frage A");
    // Answered, banned and dissolved teams are not asked about.
    const answered = await createTeamWithMembers();
    const banned = await createTeamWithMembers({ banned: true });
    const dissolved = await createTeamWithMembers();
    for (const [team, data] of [
      [answered, { showOnLanding: false }],
      [banned, {}],
      [dissolved, { dissolvedAt: NOW }],
    ] as const) {
      await prisma.team.update({
        where: { id: team.team.id },
        data: { ...data, captainId: captain.id },
      });
      await prisma.teamMember.create({
        data: { teamId: team.team.id, userId: captain.id, joinedAt: NOW },
      });
    }

    expect(await pendingShowcaseQuestion(captain.id)).toEqual([
      { id: second.team.id, name: "Frage A" },
      { id: first.team.id, name: "Frage B" },
    ]);
    // The sidebar's team query answers the same for the layout.
    expect((await getNavTeam(captain.id)).showcaseQuestion).toEqual(
      await pendingShowcaseQuestion(captain.id),
    );
    // Members are never asked.
    const member = (await createTeamWithMembers({ extraMembers: 1 })).members[0]!;
    expect(await pendingShowcaseQuestion(member.id)).toEqual([]);
  });

  it("saves each answer once and asks no more", async () => {
    const a = await createTeamWithMembers();
    const b = await createTeamWithMembers();
    await prisma.team.update({ where: { id: b.team.id }, data: { captainId: a.captain.id } });

    await answerShowcaseQuestion({
      userId: a.captain.id,
      answers: [
        { teamId: a.team.id, show: true },
        { teamId: b.team.id, show: false },
      ],
    });
    expect(await pendingShowcaseQuestion(a.captain.id)).toEqual([]);
    expect(await ids()).toEqual([a.team.id]);

    // A second answer, e.g. from another tab, changes nothing.
    await answerShowcaseQuestion({
      userId: a.captain.id,
      answers: [
        { teamId: a.team.id, show: false },
        { teamId: b.team.id, show: true },
      ],
    });
    expect(await ids()).toEqual([a.team.id]);
  });

  it("skips teams the user no longer captains or that were banned meanwhile", async () => {
    const handedOver = await createTeamWithMembers({ extraMembers: 1 });
    const oldCaptain = handedOver.captain;
    const banned = await createTeamWithMembers();
    await prisma.team.update({
      where: { id: banned.team.id },
      data: { captainId: oldCaptain.id, bannedAt: NOW },
    });
    const newCaptain = handedOver.members[0]!;
    await prisma.team.update({
      where: { id: handedOver.team.id },
      data: { captainId: newCaptain.id },
    });

    await answerShowcaseQuestion({
      userId: oldCaptain.id,
      answers: [
        { teamId: handedOver.team.id, show: true },
        { teamId: banned.team.id, show: true },
        { teamId: "no-such-team", show: true },
      ],
    });
    for (const { team } of [handedOver, banned]) {
      const row = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
      expect(row.showOnLanding).toBeNull();
    }
    // The question passes to the new captain.
    expect(await pendingShowcaseQuestion(newCaptain.id)).toEqual([
      { id: handedOver.team.id, name: handedOver.team.name },
    ]);
  });

  it("rejects invalid answers", async () => {
    const { captain, team } = await createTeamWithMembers();
    await expect(
      answerShowcaseQuestion({
        userId: captain.id,
        answers: [{ teamId: team.id, show: "yes" as unknown as boolean }],
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    const banned = await createUser({ banned: true });
    await expect(answerShowcaseQuestion({ userId: banned.id, answers: [] })).rejects.toMatchObject({
      code: "BANNED",
    });
  });
});
