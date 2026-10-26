import {
  FeedbackOutcome,
  Rank,
  RequestStatus,
  ScrimFormat,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  RELIABILITY_WINDOW_DAYS,
  getBoard,
  getReliability,
  getTeamList,
  isReliable,
} from "../src/index.ts";
import { NOW, createOpenRequest, createTeamWithMembers, createUser } from "./helpers.ts";

// Phase 27 (SPEC N-23, §5.25): reliability of the last 90 days, the rule and its filters.

afterAll(async () => {
  await prisma.$disconnect();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WINDOW_START = new Date(NOW.getTime() - RELIABILITY_WINDOW_DAYS * DAY);
const BEFORE_WINDOW = new Date(WINDOW_START.getTime() - 1);

type Team = Awaited<ReturnType<typeof createTeamWithMembers>>;

/** A booked scrim in a final state, written directly; `rating` is the guest's rating of the host. */
async function scrim(input: {
  host: Team;
  guest: Team;
  status: ScrimStatus;
  startsAt: Date;
  noShow?: Team;
  lateCancelBy?: Team;
  rating?: number;
}) {
  const request = await prisma.scrimRequest.create({
    data: {
      teamId: input.host.team.id,
      createdById: input.host.captain.id,
      startsAt: input.startsAt,
      format: ScrimFormat.ONE_MAP,
      rankMin: Rank.IRON,
      rankMax: Rank.RADIANT,
      maps: [],
      status: RequestStatus.BOOKED,
      createdAt: new Date(input.startsAt.getTime() - 3 * DAY),
    },
  });
  const created = await prisma.scrim.create({
    data: {
      requestId: request.id,
      hostTeamId: input.host.team.id,
      guestTeamId: input.guest.team.id,
      startsAt: input.startsAt,
      format: ScrimFormat.ONE_MAP,
      maps: [],
      feedbackOpensAt: new Date(input.startsAt.getTime() + 3 * HOUR),
      feedbackDeadline: new Date(input.startsAt.getTime() + 75 * HOUR),
      status: input.status,
      noShowTeamId: input.noShow?.team.id ?? null,
      cancelledByTeamId: input.lateCancelBy?.team.id ?? null,
      cancelledAt: input.lateCancelBy ? new Date(input.startsAt.getTime() - HOUR) : null,
      lateCancel: input.lateCancelBy !== undefined,
      createdAt: new Date(input.startsAt.getTime() - 2 * DAY),
    },
  });
  if (input.rating !== undefined) {
    await prisma.scrimFeedback.create({
      data: {
        scrimId: created.id,
        teamId: input.guest.team.id,
        submittedById: input.guest.captain.id,
        outcome: FeedbackOutcome.PLAYED,
        rating: input.rating,
        createdAt: input.startsAt,
      },
    });
  }
}

/** Five letters from g–z, never part of other test teams' hex IDs: a search finds only ours. */
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

describe("getReliability over the last 90 days (§5.25)", () => {
  it("counts only scrims that start in the window, the start of the window included", async () => {
    const team = await createTeamWithMembers();
    const opponent = await createTeamWithMembers();
    const completed = (startsAt: Date, rating: number) =>
      scrim({ host: team, guest: opponent, status: ScrimStatus.COMPLETED, startsAt, rating });
    await completed(WINDOW_START, 5);
    await completed(new Date(NOW.getTime() - 10 * DAY), 4);
    await completed(new Date(NOW.getTime() - DAY), 3);
    // Older: neither the scrim nor its rating counts.
    await completed(BEFORE_WINDOW, 1);
    const noShow = (startsAt: Date) =>
      scrim({ host: team, guest: opponent, status: ScrimStatus.NO_SHOW, startsAt, noShow: team });
    await noShow(new Date(NOW.getTime() - 2 * DAY));
    await noShow(BEFORE_WINDOW);
    const lateCancel = (startsAt: Date) =>
      scrim({
        host: team,
        guest: opponent,
        status: ScrimStatus.CANCELLED,
        startsAt,
        lateCancelBy: team,
      });
    // A late cancellation of a scrim that would still lie ahead counts right away.
    await lateCancel(new Date(NOW.getTime() + 2 * DAY));
    await lateCancel(BEFORE_WINDOW);

    expect(await getReliability(team.team.id, NOW)).toEqual({
      played: 3,
      noShows: 1,
      lateCancels: 1,
      avgRating: 4,
    });
    // 90 days later all of it has left the window.
    const later = new Date(NOW.getTime() + RELIABILITY_WINDOW_DAYS * DAY + 3 * DAY);
    expect(await getReliability(team.team.id, later)).toEqual({
      played: 0,
      noShows: 0,
      lateCancels: 0,
      avgRating: null,
    });
  });
});

describe("isReliable (SPEC N-23)", () => {
  it("needs a no-show rate below 10 %, a team without scrims is reliable", () => {
    expect(isReliable({ played: 0, noShows: 0 })).toBe(true);
    expect(isReliable({ played: 10, noShows: 0 })).toBe(true);
    // 1 of 11 is about 9.1 %, 1 of 10 is exactly 10 %.
    expect(isReliable({ played: 10, noShows: 1 })).toBe(true);
    expect(isReliable({ played: 9, noShows: 1 })).toBe(false);
    expect(isReliable({ played: 0, noShows: 1 })).toBe(false);
  });
});

describe("the reliability filter", () => {
  async function teams() {
    const opponent = await createTeamWithMembers();
    // Half of its scrims were no-shows.
    const unreliable = await createTeamWithMembers();
    await scrim({
      host: unreliable,
      guest: opponent,
      status: ScrimStatus.COMPLETED,
      startsAt: new Date(NOW.getTime() - 5 * DAY),
    });
    await scrim({
      host: unreliable,
      guest: opponent,
      status: ScrimStatus.NO_SHOW,
      startsAt: new Date(NOW.getTime() - 4 * DAY),
      noShow: unreliable,
    });
    // New, without scrims.
    const fresh = await createTeamWithMembers();
    // Its only no-show is older than the window, and late cancellations do not count.
    const recovered = await createTeamWithMembers();
    await scrim({
      host: recovered,
      guest: opponent,
      status: ScrimStatus.NO_SHOW,
      startsAt: BEFORE_WINDOW,
      noShow: recovered,
    });
    await scrim({
      host: recovered,
      guest: opponent,
      status: ScrimStatus.CANCELLED,
      startsAt: new Date(NOW.getTime() - DAY),
      lateCancelBy: recovered,
    });
    return { unreliable, fresh, recovered };
  }

  it("filters the board by the no-show rate of the request's team", async () => {
    const { unreliable, fresh, recovered } = await teams();
    const requests = await Promise.all(
      [unreliable, fresh, recovered].map((team) => createOpenRequest(team.captain.id)),
    );
    const ids = new Set(requests.map((request) => request.id));
    const viewer = await createUser();
    const board = async (reliableOnly?: boolean) => {
      const result = await getBoard({ userId: viewer.id, reliableOnly, now: NOW });
      return {
        filter: result.filter,
        teams: result.requests.filter((card) => ids.has(card.id)).map((card) => card.team.id),
      };
    };
    const all = await board();
    expect(all.filter.reliableOnly).toBe(false);
    expect(new Set(all.teams)).toEqual(
      new Set([unreliable.team.id, fresh.team.id, recovered.team.id]),
    );
    const filtered = await board(true);
    expect(filtered.filter.reliableOnly).toBe(true);
    expect(new Set(filtered.teams)).toEqual(new Set([fresh.team.id, recovered.team.id]));
  });

  it("shows the reliability in the teams list and filters it", async () => {
    const tok = token();
    const { unreliable, fresh, recovered } = await teams();
    await rename(unreliable.team.id, `${tok} Alpha`);
    await rename(fresh.team.id, `${tok} Beta`);
    await rename(recovered.team.id, `${tok} Gamma`);
    const viewer = await createUser();

    const all = await getTeamList({ userId: viewer.id, search: tok, now: NOW });
    expect(all.filter.reliableOnly).toBe(false);
    expect(all.teams.map((team) => [team.name, team.reliability])).toEqual([
      [`${tok} Alpha`, { played: 1, noShows: 1, lateCancels: 0, avgRating: null }],
      [`${tok} Beta`, { played: 0, noShows: 0, lateCancels: 0, avgRating: null }],
      [`${tok} Gamma`, { played: 0, noShows: 0, lateCancels: 1, avgRating: null }],
    ]);
    const filtered = await getTeamList({
      userId: viewer.id,
      search: tok,
      reliableOnly: true,
      now: NOW,
    });
    expect(filtered.filter.reliableOnly).toBe(true);
    expect(filtered.teams.map((team) => team.id)).toEqual([fresh.team.id, recovered.team.id]);
  });
});
