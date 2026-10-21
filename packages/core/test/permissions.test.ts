import { Rank, prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  deleteRequest,
  isTeamReady,
  leaveTeam,
  requireActingCaptain,
  requireAdmin,
  requireCaptain,
  requireTeamMember,
  requireTeamReady,
  requireUser,
  requireVerified,
  updateTeam,
} from "../src/index.ts";
import {
  NOW,
  createOpenRequest,
  createReadyTeam,
  createTeamWithMembers,
  createUser,
} from "./helpers.ts";

const NOT_IN_TEAM = { code: "FORBIDDEN", message: "Du bist nicht in diesem Team." };

/** Dissolved the real way: the captain leaves as the last member, which deletes the membership. */
async function dissolvedTeam() {
  const dissolved = await createTeamWithMembers();
  await leaveTeam({ userId: dissolved.captain.id, now: NOW });
  return dissolved;
}

const previousAdmins = process.env.ADMIN_DISCORD_IDS;

afterAll(async () => {
  process.env.ADMIN_DISCORD_IDS = previousAdmins;
  await prisma.$disconnect();
});

describe("requireUser / requireVerified", () => {
  it("rejects missing and unknown users", async () => {
    await expect(requireUser(null)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(requireUser("missing")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects banned users", async () => {
    const user = await createUser({ banned: true });
    await expect(requireUser(user.id)).rejects.toMatchObject({ code: "BANNED" });
  });

  it("requires verification for requireVerified", async () => {
    const unverified = await createUser();
    const verified = await createUser({ verified: true });
    await expect(requireUser(unverified.id)).resolves.toMatchObject({ id: unverified.id });
    await expect(requireVerified(unverified.id)).rejects.toMatchObject({ code: "NOT_VERIFIED" });
    await expect(requireVerified(verified.id)).resolves.toMatchObject({ id: verified.id });
  });
});

describe("requireCaptain / requireActingCaptain", () => {
  it("allows an unverified captain to manage, but not to act", async () => {
    const { team, captain } = await createTeamWithMembers({ verifiedCaptain: false });
    await expect(requireCaptain(captain.id, team.id)).resolves.toBeTruthy();
    await expect(requireActingCaptain(captain.id, team.id)).rejects.toMatchObject({
      code: "NOT_VERIFIED",
    });
  });

  it("allows a verified captain to act", async () => {
    const { team, captain } = await createTeamWithMembers();
    await expect(requireActingCaptain(captain.id, team.id)).resolves.toBeTruthy();
  });

  it("rejects members who are not the captain", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1 });
    await expect(requireCaptain(members[0]!.id, team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects banned and dissolved teams", async () => {
    const banned = await createTeamWithMembers({ banned: true });
    await expect(requireCaptain(banned.captain.id, banned.team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Das Team ist gesperrt.",
    });
    const dissolved = await dissolvedTeam();
    await expect(requireCaptain(dissolved.captain.id, dissolved.team.id)).rejects.toMatchObject(
      NOT_IN_TEAM,
    );
    // A membership row left behind on a dissolved team does not count either.
    const leftover = await createTeamWithMembers();
    await prisma.team.update({ where: { id: leftover.team.id }, data: { dissolvedAt: NOW } });
    await expect(requireCaptain(leftover.captain.id, leftover.team.id)).rejects.toMatchObject(
      NOT_IN_TEAM,
    );
  });

  it("gives non-members one answer for active, banned, dissolved and unknown teams (§4)", async () => {
    const outsider = await createTeamWithMembers();
    const active = await createTeamWithMembers();
    const banned = await createTeamWithMembers({ banned: true });
    const dissolved = await dissolvedTeam();
    for (const teamId of [active.team.id, banned.team.id, dissolved.team.id, "unknown-team"]) {
      await expect(requireCaptain(outsider.captain.id, teamId)).rejects.toMatchObject(NOT_IN_TEAM);
      await expect(requireActingCaptain(outsider.captain.id, teamId)).rejects.toMatchObject(
        NOT_IN_TEAM,
      );
      await expect(
        updateTeam({
          userId: outsider.captain.id,
          teamId,
          name: "Fremd",
          tag: "FR",
          rank: Rank.GOLD,
        }),
      ).rejects.toMatchObject(NOT_IN_TEAM);
    }
  });

  it("does not reveal a ban through another team's request (§4)", async () => {
    const outsider = await createReadyTeam();
    const owner = await createReadyTeam();
    const request = await createOpenRequest(owner.captain.id);
    const remove = () =>
      deleteRequest({ userId: outsider.captain.id, requestId: request.id, now: NOW });
    await expect(remove()).rejects.toMatchObject(NOT_IN_TEAM);
    // Banned directly, so the request is still open, as in a race with the ban.
    await prisma.team.update({ where: { id: owner.team.id }, data: { bannedAt: NOW } });
    await expect(remove()).rejects.toMatchObject(NOT_IN_TEAM);
  });
});

describe("requireTeamMember", () => {
  it("accepts members, also of banned teams", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1, banned: true });
    await expect(requireTeamMember(members[0]!.id, team.id)).resolves.toBeTruthy();
  });

  it("rejects outsiders", async () => {
    const { team } = await createTeamWithMembers();
    const outsider = await createUser();
    await expect(requireTeamMember(outsider.id, team.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("requireTeamReady / isTeamReady", () => {
  it("needs 5 verified members", async () => {
    const ready = await createTeamWithMembers({ extraMembers: 4 });
    expect(await isTeamReady(ready.team.id)).toBe(true);
    await expect(requireTeamReady(ready.team.id)).resolves.toBeUndefined();

    const notReady = await createTeamWithMembers({ extraMembers: 4, verifiedMembers: false });
    expect(await isTeamReady(notReady.team.id)).toBe(false);
    await expect(requireTeamReady(notReady.team.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("requireAdmin", () => {
  it("accepts Discord IDs from ADMIN_DISCORD_IDS only", async () => {
    const admin = await createUser();
    const user = await createUser();
    process.env.ADMIN_DISCORD_IDS = `1,${admin.discordId}`;
    await expect(requireAdmin(admin.id)).resolves.toMatchObject({ id: admin.id });
    await expect(requireAdmin(user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
