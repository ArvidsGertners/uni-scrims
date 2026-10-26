// Phase 21 (SPEC N-17, ARCHITECTURE §5.20): several teams per user, the active team, rights per
// team, bans and deletions across teams, and requests for more teams.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MemberRole, prisma, TeamLimitStatus } from "@uni-scrims/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TRANSFER_CAPTAIN_FIRST,
  applyToRequest,
  banUser,
  canSeeAvatar,
  cancelScrim,
  confirmApplication,
  createRequest,
  decideTeamLimitRequest,
  deleteAccount,
  exportAccountData,
  findOwnTeam,
  getAccount,
  getNavTeam,
  getOtherOwnScrimTeam,
  getRequestDetail,
  getScrimDetail,
  getTeamLimitStatus,
  joinTeam,
  leaveTeam,
  linkTeamChannel,
  listCaptainTeamsForDiscordUser,
  listTeamLimitRequests,
  setActiveTeam,
  submitTeamLimitRequest,
  transferCaptain,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_INPUT,
  createFullyVerifiedTeam,
  createTeamWithMembers,
  createUser,
  useAdmin,
} from "./helpers.ts";

const LATER = new Date(NOW.getTime() + 60_000);
const admin = useAdmin();
let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-teams-"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function addMember(
  teamId: string,
  userId: string,
  options: { role?: MemberRole; joinedAt?: Date } = {},
) {
  await prisma.teamMember.create({
    data: {
      teamId,
      userId,
      role: options.role ?? MemberRole.PLAYER,
      joinedAt: options.joinedAt ?? LATER,
    },
  });
}

/** The captain of `first` also captains `second` (and is its member). */
async function captainOfBoth() {
  const first = await createFullyVerifiedTeam();
  const second = await createFullyVerifiedTeam();
  await addMember(second.team.id, first.captain.id);
  await prisma.team.update({
    where: { id: second.team.id },
    data: { captainId: first.captain.id },
  });
  return { user: first.captain, first, second };
}

describe("the active team", () => {
  it("is the chosen team, else the last joined one; switching only into own teams", async () => {
    const first = await createTeamWithMembers();
    const second = await createTeamWithMembers();
    const user = first.captain;
    await addMember(second.team.id, user.id);
    // No choice yet (all accounts from before Phase 21): the team joined last.
    expect((await findOwnTeam(user.id))?.id).toBe(second.team.id);
    await setActiveTeam({ userId: user.id, teamId: first.team.id });
    expect((await findOwnTeam(user.id))?.id).toBe(first.team.id);

    // Leaving the active team falls back to the other one.
    await expect(leaveTeam({ userId: user.id, teamId: first.team.id, now: NOW })).resolves.toEqual({
      dissolved: true,
    });
    expect((await findOwnTeam(user.id))?.id).toBe(second.team.id);
    await expect(setActiveTeam({ userId: user.id, teamId: first.team.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const foreign = await createTeamWithMembers();
    await expect(setActiveTeam({ userId: user.id, teamId: foreign.team.id })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });

  it("lists all own teams for the sidebar, by name, with the active one marked", async () => {
    const first = await createTeamWithMembers();
    const second = await createTeamWithMembers();
    await addMember(second.team.id, first.captain.id, { role: MemberRole.COACH });
    await setActiveTeam({ userId: first.captain.id, teamId: first.team.id });
    const nav = await getNavTeam(first.captain.id);
    const byName = [first.team, second.team].sort((a, b) => a.name.localeCompare(b.name, "de"));
    expect(nav.teams.map((team) => [team.id, team.active])).toEqual(
      byName.map((team) => [team.id, team.id === first.team.id]),
    );
    expect(nav).toMatchObject({ team: { id: first.team.id }, teamCount: 2, teamLimit: 5 });
  });
});

describe("actions act for the team they get", () => {
  it("posts, applies, confirms and cancels per team, also between two own teams", async () => {
    const { user, first, second } = await captainOfBoth();
    await setActiveTeam({ userId: user.id, teamId: first.team.id });
    // Posted for the second team, although the first is active.
    const request = await createRequest({
      ...REQUEST_INPUT,
      userId: user.id,
      teamId: second.team.id,
      now: NOW,
    });
    expect(request.teamId).toBe(second.team.id);

    // The page shows the request for the active team and offers to switch to the owner.
    const detail = await getRequestDetail({ userId: user.id, requestId: request.id, now: NOW });
    expect(detail).toMatchObject({
      actingTeamId: first.team.id,
      otherOwnTeam: { id: second.team.id, name: second.team.name },
      apply: { problem: null },
      applications: null,
    });

    // Teams with a shared member may play each other; the own request stays excluded.
    await expect(
      applyToRequest({ userId: user.id, teamId: second.team.id, requestId: request.id, now: NOW }),
    ).rejects.toThrow("eigene Anfrage");
    const { application } = await applyToRequest({
      userId: user.id,
      teamId: first.team.id,
      requestId: request.id,
      now: NOW,
    });
    const scrim = await confirmApplication({
      userId: user.id,
      requestId: request.id,
      applicationId: application.id,
      now: NOW,
    });

    // In both teams of the scrim: the active one decides the view, each form its team.
    expect(await getScrimDetail({ userId: user.id, scrimId: scrim.id, now: NOW })).toMatchObject({
      isHost: false,
      ownTeam: { id: first.team.id },
    });
    await cancelScrim({ userId: user.id, teamId: second.team.id, scrimId: scrim.id, now: NOW });
    expect(await prisma.scrim.findUniqueOrThrow({ where: { id: scrim.id } })).toMatchObject({
      cancelledByTeamId: second.team.id,
    });
  });

  it("refuses a team the user is not a member of, and scrims of other teams", async () => {
    const own = await createFullyVerifiedTeam();
    const other = await createFullyVerifiedTeam();
    await expect(
      createRequest({ ...REQUEST_INPUT, userId: own.captain.id, teamId: other.team.id, now: NOW }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const request = await createRequest({
      ...REQUEST_INPUT,
      userId: other.captain.id,
      teamId: other.team.id,
      now: NOW,
    });
    await expect(
      applyToRequest({
        userId: own.captain.id,
        teamId: other.team.id,
        requestId: request.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("points to another own team that plays a scrim the active one does not", async () => {
    const host = await createFullyVerifiedTeam();
    const guest = await createFullyVerifiedTeam();
    const request = await createRequest({
      ...REQUEST_INPUT,
      userId: host.captain.id,
      teamId: host.team.id,
      now: NOW,
    });
    const { application } = await applyToRequest({
      userId: guest.captain.id,
      teamId: guest.team.id,
      requestId: request.id,
      now: NOW,
    });
    const scrim = await confirmApplication({
      userId: host.captain.id,
      requestId: request.id,
      applicationId: application.id,
      now: NOW,
    });
    const member = guest.members[0]!;
    const elsewhere = await createTeamWithMembers();
    await addMember(elsewhere.team.id, member.id);
    await setActiveTeam({ userId: member.id, teamId: elsewhere.team.id });
    expect(await getScrimDetail({ userId: member.id, scrimId: scrim.id, now: NOW })).toBeNull();
    expect(await getOtherOwnScrimTeam({ userId: member.id, scrimId: scrim.id })).toEqual({
      id: guest.team.id,
      name: guest.team.name,
    });
    await setActiveTeam({ userId: member.id, teamId: guest.team.id });
    expect(await getOtherOwnScrimTeam({ userId: member.id, scrimId: scrim.id })).toBeNull();
    expect(await getOtherOwnScrimTeam({ userId: elsewhere.captain.id, scrimId: scrim.id })).toBe(
      null,
    );
  });

  it("shows avatars to members of any shared team", async () => {
    const shared = await createTeamWithMembers({ extraMembers: 1 });
    const viewer = await createTeamWithMembers();
    await addMember(shared.team.id, viewer.captain.id);
    await setActiveTeam({ userId: viewer.captain.id, teamId: viewer.team.id });
    expect(await canSeeAvatar(viewer.captain, shared.members[0]!.id)).toBe(true);
    const stranger = await createUser();
    expect(await canSeeAvatar(viewer.captain, stranger.id)).toBe(false);
  });
});

describe("bans and deletion across teams", () => {
  it("bans every team the user captains and removes them from the others", async () => {
    const captained = await createTeamWithMembers({ extraMembers: 1 });
    const joined = await createTeamWithMembers({ extraMembers: 1 });
    const user = captained.captain;
    await addMember(joined.team.id, user.id);
    await banUser({ adminId: admin.id, userId: user.id, uploadDir, now: NOW });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: captained.team.id } })).toMatchObject(
      { bannedAt: NOW, captainId: user.id },
    );
    expect(
      (await prisma.team.findUniqueOrThrow({ where: { id: joined.team.id } })).bannedAt,
    ).toBeNull();
    expect(await prisma.teamMember.findMany({ where: { userId: user.id } })).toEqual([
      expect.objectContaining({ teamId: captained.team.id }),
    ]);
  });

  it("needs the captain role handed over in every team with members, then leaves all", async () => {
    const alone = await createTeamWithMembers();
    const user = alone.captain;
    const joined = await createTeamWithMembers({ extraMembers: 1 });
    await addMember(joined.team.id, user.id);
    const blocking = await createTeamWithMembers({ extraMembers: 1 });
    await addMember(blocking.team.id, user.id);
    await prisma.team.update({ where: { id: blocking.team.id }, data: { captainId: user.id } });
    await submitTeamLimitRequest({ userId: user.id, reason: "Ich betreue drei Teams.", now: NOW });

    const account = await getAccount(user.id);
    expect(account.deletionProblem).toEqual(TRANSFER_CAPTAIN_FIRST);
    expect(account.teams.filter((team) => team.blocksDeletion).map((team) => team.id)).toEqual([
      blocking.team.id,
    ]);
    await expect(deleteAccount({ userId: user.id, uploadDir, now: NOW })).rejects.toMatchObject({
      text: TRANSFER_CAPTAIN_FIRST,
    });

    await transferCaptain({
      userId: user.id,
      teamId: blocking.team.id,
      newCaptainId: blocking.captain.id,
    });
    await deleteAccount({ userId: user.id, uploadDir, now: NOW });
    expect(
      (await prisma.team.findUniqueOrThrow({ where: { id: alone.team.id } })).dissolvedAt,
    ).toEqual(NOW);
    expect(await prisma.teamMember.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.teamLimitRequest.count({ where: { userId: user.id } })).toBe(0);
    for (const team of [joined.team, blocking.team]) {
      expect((await prisma.team.findUniqueOrThrow({ where: { id: team.id } })).dissolvedAt).toBe(
        null,
      );
    }
  });

  it("exports all teams, the active one, the limit and the requests", async () => {
    const first = await createTeamWithMembers();
    const second = await createTeamWithMembers();
    await addMember(second.team.id, first.captain.id, { role: MemberRole.COACH });
    await setActiveTeam({ userId: first.captain.id, teamId: first.team.id });
    await submitTeamLimitRequest({
      userId: first.captain.id,
      reason: "Wir haben noch ein drittes Team.",
      now: NOW,
    });
    const data = await exportAccountData({
      userId: first.captain.id,
      now: NOW,
      privacyPolicyUrl: "https://uniscrims.example/datenschutz",
      uploadDir,
    });
    expect(data.teams).toEqual([
      expect.objectContaining({ name: first.team.name, rolle: "Spieler", captain: true }),
      expect.objectContaining({ name: second.team.name, rolle: "Coach", captain: false }),
    ]);
    expect(data).toMatchObject({
      aktivesTeam: first.team.name,
      teamLimit: 5,
      teamAnträge: [
        {
          gestelltAm: NOW,
          begründung: "Wir haben noch ein drittes Team.",
          status: "In Prüfung",
          neuesLimit: null,
          entschiedenAm: null,
        },
      ],
    });
  });
});

describe("requests for more teams", () => {
  it("allows one open request, raised or rejected by an admin, shown on the support page", async () => {
    const user = await createUser();
    await expect(
      submitTeamLimitRequest({ userId: user.id, reason: "zu kurz", now: NOW }),
    ).rejects.toMatchObject({ code: "INVALID" });
    await submitTeamLimitRequest({ userId: user.id, reason: "Ich manage sechs Teams.", now: NOW });
    await expect(
      submitTeamLimitRequest({ userId: user.id, reason: "Noch ein Antrag bitte.", now: NOW }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const listed = (await listTeamLimitRequests(admin.id)).find((row) => row.userId === user.id);
    expect(listed).toMatchObject({ reason: "Ich manage sechs Teams.", teamCount: 0, teamLimit: 5 });
    const decide = (decision: "APPROVED" | "REJECTED", newLimit?: number) =>
      decideTeamLimitRequest({
        adminId: admin.id,
        requestId: listed!.id,
        decision,
        newLimit,
        now: LATER,
      });
    await expect(decide("APPROVED", 5)).rejects.toMatchObject({ code: "INVALID" });
    await expect(decide("APPROVED", 51)).rejects.toMatchObject({ code: "INVALID" });
    await decide("APPROVED", 8);
    await expect(decide("REJECTED")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getTeamLimitStatus(user.id)).toEqual({
      teamCount: 0,
      teamLimit: 8,
      requestProblem: null,
      latest: {
        status: TeamLimitStatus.APPROVED,
        createdAt: NOW,
        decidedAt: LATER,
        newLimit: 8,
      },
    });

    // A rejection leaves the limit.
    await submitTeamLimitRequest({
      userId: user.id,
      reason: "Jetzt bitte zehn Teams.",
      now: LATER,
    });
    const second = (await listTeamLimitRequests(admin.id)).find((row) => row.userId === user.id);
    await decideTeamLimitRequest({
      adminId: admin.id,
      requestId: second!.id,
      decision: "REJECTED",
      now: LATER,
    });
    expect(await getTeamLimitStatus(user.id)).toMatchObject({
      teamLimit: 8,
      latest: { status: TeamLimitStatus.REJECTED, newLimit: null },
    });

    // At the highest limit nobody could approve more, so no request is taken.
    await prisma.user.update({ where: { id: user.id }, data: { teamLimit: 50 } });
    await expect(
      submitTeamLimitRequest({ userId: user.id, reason: "Noch mehr Teams bitte.", now: LATER }),
    ).rejects.toThrow("Mehr als 50 Teams");
    expect(await getTeamLimitStatus(user.id)).toMatchObject({
      requestProblem: { key: "teamLimitAtMax" },
    });
  });

  it("lets a raised limit found and join more teams", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { teamLimit: 1 } });
    const first = await createTeamWithMembers();
    const second = await createTeamWithMembers();
    await joinTeam({ userId: user.id, inviteCode: first.team.inviteCode!, now: NOW });
    await expect(
      joinTeam({ userId: user.id, inviteCode: second.team.inviteCode!, now: NOW }),
    ).rejects.toThrow("beim Support beantragen");
    await prisma.user.update({ where: { id: user.id }, data: { teamLimit: 2 } });
    await joinTeam({ userId: user.id, inviteCode: second.team.inviteCode!, now: NOW });
    expect(await prisma.teamMember.count({ where: { userId: user.id } })).toBe(2);
  });

  it("keeps the limit when the user joins two teams at the same time", async () => {
    for (let round = 0; round < 5; round++) {
      const user = await createUser();
      await prisma.user.update({ where: { id: user.id }, data: { teamLimit: 1 } });
      const first = await createTeamWithMembers();
      const second = await createTeamWithMembers();
      const results = await Promise.allSettled([
        joinTeam({ userId: user.id, inviteCode: first.team.inviteCode!, now: NOW }),
        joinTeam({ userId: user.id, inviteCode: second.team.inviteCode!, now: NOW }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await prisma.teamMember.count({ where: { userId: user.id } })).toBe(1);
    }
  });
});

describe("/setup with several teams", () => {
  const link = (discordUserId: string, team?: string) =>
    linkTeamChannel({ discordUserId, guildId: "600", channelId: "601", team });

  it("asks which team when the user captains several, and links the chosen one", async () => {
    const { user, first, second } = await captainOfBoth();
    await expect(link(user.discordId)).rejects.toThrow("Option „team“");
    expect(await link(user.discordId, second.team.id)).toEqual({
      id: second.team.id,
      name: second.team.name,
    });
    // A typed name without picking a suggestion, in any case.
    expect(await link(user.discordId, ` ${first.team.name.toUpperCase()} `)).toEqual({
      id: first.team.id,
      name: first.team.name,
    });
    await expect(link(user.discordId, "Kein solches Team")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // A team the user is only a member of is refused like before.
    const joined = await createTeamWithMembers();
    await addMember(joined.team.id, user.id);
    await expect(link(user.discordId, joined.team.id)).rejects.toThrow(
      "Das kann nur euer Captain.",
    );

    // Banned teams are no choice, so the other one is the only captain team left.
    await prisma.team.update({ where: { id: second.team.id }, data: { bannedAt: NOW } });
    expect(await link(user.discordId)).toEqual({ id: first.team.id, name: first.team.name });
  });

  it("suggests the teams the user captains that are not banned", async () => {
    const { user, first, second } = await captainOfBoth();
    const byName = [first.team, second.team].sort((a, b) => a.name.localeCompare(b.name, "de"));
    expect(await listCaptainTeamsForDiscordUser(user.discordId, "")).toEqual(
      byName.map((team) => ({ id: team.id, name: team.name })),
    );
    expect(
      await listCaptainTeamsForDiscordUser(user.discordId, first.team.name.slice(5).toUpperCase()),
    ).toEqual([{ id: first.team.id, name: first.team.name }]);
    await prisma.team.update({ where: { id: first.team.id }, data: { bannedAt: NOW } });
    expect(await listCaptainTeamsForDiscordUser(user.discordId, "")).toEqual([
      { id: second.team.id, name: second.team.name },
    ]);
    expect(await listCaptainTeamsForDiscordUser("123456789", "")).toEqual([]);
    const banned = await createUser({ banned: true });
    expect(await listCaptainTeamsForDiscordUser(banned.discordId, "")).toEqual([]);
  });
});
