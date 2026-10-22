import { AppStatus, NotifType, RequestStatus, ScrimStatus, prisma } from "@uni-scrims/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyToRequest, banTeam, banUser } from "../src/index.ts";
import {
  NOW,
  SOON,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createSession,
  createUser,
} from "./helpers.ts";

const previousAdmins = process.env.ADMIN_DISCORD_IDS;
let admin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  admin = await createUser({ verified: true });
  process.env.ADMIN_DISCORD_IDS = admin.discordId;
});

afterAll(async () => {
  process.env.ADMIN_DISCORD_IDS = previousAdmins;
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
