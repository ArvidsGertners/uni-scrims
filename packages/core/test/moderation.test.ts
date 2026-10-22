import { AppStatus, NotifType, RequestStatus, ScrimStatus, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import { applyToRequest, banTeam, banUser, searchModerationTargets } from "../src/index.ts";
import {
  NOW,
  SOON,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createSession,
  createUser,
  uid,
  useAdmin,
} from "./helpers.ts";

const admin = useAdmin();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("banTeam", () => {
  it("is only for admins", async () => {
    const { team, captain } = await createReadyTeam();
    await expect(banTeam({ adminId: captain.id, teamId: team.id, now: NOW })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      bannedAt: null,
    });
  });

  it("retires requests, applications and future scrims, never as late cancellation", async () => {
    // The banned team hosts a scrim within 24 h, has an open request with an applicant and has
    // applied to another request.
    const { host: banned, guest: opponent, scrim } = await bookScrim(SOON);
    const applicant = await createReadyTeam();
    const ownRequest = await createOpenRequest(banned.captain.id);
    await applyToRequest({ userId: applicant.captain.id, requestId: ownRequest.id, now: NOW });
    const other = await createReadyTeam();
    const foreignRequest = await createOpenRequest(other.captain.id);
    const { application } = await applyToRequest({
      userId: banned.captain.id,
      requestId: foreignRequest.id,
      now: NOW,
    });

    await banTeam({ adminId: admin.id, teamId: banned.team.id, now: NOW });

    expect(await prisma.team.findUnique({ where: { id: banned.team.id } })).toMatchObject({
      bannedAt: NOW,
      dissolvedAt: null,
    });
    expect(await prisma.scrimRequest.findUnique({ where: { id: ownRequest.id } })).toMatchObject({
      status: RequestStatus.CANCELLED,
    });
    expect(
      await prisma.notification.findMany({
        where: { requestId: ownRequest.id, type: NotifType.REQUEST_DELETED },
        select: { targetTeamId: true },
      }),
    ).toEqual([{ targetTeamId: applicant.team.id }]);
    expect(await prisma.application.findUnique({ where: { id: application.id } })).toMatchObject({
      status: AppStatus.WITHDRAWN,
    });
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.CANCELLED,
      cancelledByTeamId: banned.team.id,
      lateCancel: false,
    });
    expect(
      await prisma.notification.count({
        where: {
          scrimId: scrim.id,
          type: NotifType.SCRIM_CANCELLED,
          targetTeamId: opponent.team.id,
        },
      }),
    ).toBe(2);
    // Members stay in the banned team and can leave it themselves.
    expect(await prisma.teamMember.count({ where: { teamId: banned.team.id } })).toBe(5);
  });

  it("rejects a second ban and unknown teams", async () => {
    const { team } = await createReadyTeam();
    await banTeam({ adminId: admin.id, teamId: team.id, now: NOW });
    await expect(banTeam({ adminId: admin.id, teamId: team.id, now: NOW })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(banTeam({ adminId: admin.id, teamId: "unknown", now: NOW })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });
});

describe("banUser", () => {
  it("removes a player from the team and ends the sessions", async () => {
    const { team, members } = await createReadyTeam();
    const player = members[0]!;
    await createSession(player.id);

    await expect(banUser({ adminId: admin.id, userId: player.id, now: NOW })).resolves.toEqual({
      teamBanned: false,
    });

    expect(await prisma.user.findUnique({ where: { id: player.id } })).toMatchObject({
      bannedAt: NOW,
    });
    expect(await prisma.session.count({ where: { userId: player.id } })).toBe(0);
    expect(await prisma.teamMember.findUnique({ where: { userId: player.id } })).toBeNull();
    expect(await prisma.team.findUnique({ where: { id: team.id } })).toMatchObject({
      bannedAt: null,
    });
  });

  it("keeps a captain in the team and bans the team with them", async () => {
    const { host, scrim } = await bookScrim();
    await createSession(host.captain.id);

    await expect(
      banUser({ adminId: admin.id, userId: host.captain.id, now: NOW }),
    ).resolves.toEqual({ teamBanned: true });

    expect(await prisma.session.count({ where: { userId: host.captain.id } })).toBe(0);
    expect(await prisma.team.findUnique({ where: { id: host.team.id } })).toMatchObject({
      bannedAt: NOW,
      captainId: host.captain.id,
    });
    expect(
      await prisma.teamMember.findUnique({ where: { userId: host.captain.id } }),
    ).toMatchObject({ teamId: host.team.id });
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.CANCELLED,
      lateCancel: false,
    });
  });

  it("bans the captain of an already banned team", async () => {
    const { team, captain } = await createReadyTeam();
    await banTeam({ adminId: admin.id, teamId: team.id, now: NOW });
    await expect(banUser({ adminId: admin.id, userId: captain.id, now: NOW })).resolves.toEqual({
      teamBanned: false,
    });
    expect(await prisma.user.findUnique({ where: { id: captain.id } })).toMatchObject({
      bannedAt: NOW,
    });
  });

  it("bans users without a team and rejects bans that make no sense", async () => {
    const loner = await createUser();
    await banUser({ adminId: admin.id, userId: loner.id, now: NOW });
    expect(await prisma.user.findUnique({ where: { id: loner.id } })).toMatchObject({
      bannedAt: NOW,
    });
    await expect(banUser({ adminId: admin.id, userId: loner.id, now: NOW })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(banUser({ adminId: admin.id, userId: admin.id, now: NOW })).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(banUser({ adminId: admin.id, userId: "unknown", now: NOW })).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
    const other = await createUser();
    await expect(banUser({ adminId: other.id, userId: loner.id, now: NOW })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("searchModerationTargets", () => {
  const search = (query: string) => searchModerationTargets({ adminId: admin.id, query });

  it("is only for admins and needs two characters", async () => {
    const user = await createUser();
    await expect(
      searchModerationTargets({ adminId: user.id, query: user.name }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(search(" a ")).resolves.toEqual({ users: [], teams: [] });
  });

  it("finds users by part of the name or the exact Discord ID, with their team", async () => {
    const { team, captain, members } = await createReadyTeam();
    const byName = await search(captain.name.slice(5).toUpperCase());
    expect(byName.users).toEqual([
      {
        id: captain.id,
        name: captain.name,
        image: null,
        discordId: captain.discordId,
        banned: false,
        team: { id: team.id, name: team.name, isCaptain: true },
      },
    ]);
    const player = members[0]!;
    const byId = await search(player.discordId);
    expect(byId.users).toMatchObject([{ id: player.id, team: { id: team.id, isCaptain: false } }]);
    // Only the exact ID, not a part of it.
    expect((await search(player.discordId.slice(0, -1))).users).not.toContainEqual(
      expect.objectContaining({ id: player.id }),
    );
  });

  it("skips users without a Discord account and dissolved teams, and marks bans", async () => {
    const marker = uid().slice(0, 8);
    const deleted = await createUser();
    await prisma.user.update({ where: { id: deleted.id }, data: { name: `Weg ${marker}` } });
    await prisma.account.deleteMany({ where: { userId: deleted.id } });
    const banned = await createUser({ banned: true });
    await prisma.user.update({ where: { id: banned.id }, data: { name: `Gesperrt ${marker}` } });

    const active = await createReadyTeam();
    const bannedTeam = await createReadyTeam();
    const dissolved = await createReadyTeam();
    for (const [team, data] of [
      [active.team, { name: `Aktiv ${marker}` }],
      [bannedTeam.team, { name: `Bann ${marker}`, bannedAt: NOW }],
      [dissolved.team, { name: `Aufgelöst ${marker}`, dissolvedAt: NOW, nameNormalized: null }],
    ] as const) {
      await prisma.team.update({ where: { id: team.id }, data });
    }

    const result = await search(marker);
    expect(result.users).toMatchObject([{ id: banned.id, banned: true, team: null }]);
    expect(result.teams).toEqual([
      {
        id: active.team.id,
        name: `Aktiv ${marker}`,
        tag: "TST",
        banned: false,
        captainName: active.captain.name,
        memberCount: 5,
      },
      expect.objectContaining({ id: bannedTeam.team.id, banned: true }),
    ]);
  });
});
