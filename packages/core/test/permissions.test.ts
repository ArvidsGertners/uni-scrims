import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  isTeamReady,
  requireActingCaptain,
  requireAdmin,
  requireCaptain,
  requireTeamMember,
  requireTeamReady,
  requireUser,
  requireVerified,
} from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser } from "./helpers.ts";

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
    });
    const dissolved = await createTeamWithMembers();
    await prisma.team.update({ where: { id: dissolved.team.id }, data: { dissolvedAt: NOW } });
    await expect(requireCaptain(dissolved.captain.id, dissolved.team.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
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
