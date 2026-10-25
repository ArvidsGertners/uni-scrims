import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import {
  clearOAuthTokens,
  deleteAccount,
  findUserByDiscordId,
  getCurrentUser,
  getDiscordId,
  listSeedUsers,
  recordHubJoinResult,
} from "../src/index.ts";
import { NOW, createTeamWithMembers, createUser, useAdmin } from "./helpers.ts";

const admin = useAdmin();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("discord id lookups", () => {
  it("reads the Discord ID from the account row", async () => {
    const user = await createUser();
    expect(await getDiscordId(user.id)).toBe(user.discordId);
    expect((await findUserByDiscordId(user.discordId))?.id).toBe(user.id);
  });

  it("returns null for unknown users and IDs", async () => {
    expect(await getDiscordId("missing")).toBeNull();
    expect(await findUserByDiscordId("0")).toBeNull();
  });
});

describe("login side effects", () => {
  it("removes all OAuth tokens", async () => {
    const user = await createUser();
    await clearOAuthTokens(user.id);
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account.accessToken).toBeNull();
    expect(account.refreshToken).toBeNull();
    expect(account.accountId).toBe(user.discordId);
  });

  it("sets and clears hubJoinFailedAt", async () => {
    const user = await createUser();
    await recordHubJoinResult(user.id, false, NOW);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).hubJoinFailedAt,
    ).toEqual(NOW);
    await recordHubJoinResult(user.id, true, NOW);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).hubJoinFailedAt,
    ).toBeNull();
  });
});

describe("recordHubJoinResult on a deleted account", () => {
  it("writes nothing for an account deleted during the join (§4)", async () => {
    const user = await createUser();
    await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
    await recordHubJoinResult(user.id, false, NOW);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).hubJoinFailedAt,
    ).toBeNull();
  });
});

describe("getCurrentUser", () => {
  it("returns the header data, banned users and the admin flag included", async () => {
    const user = await createUser({ verified: true, banned: true });
    await prisma.user.update({ where: { id: user.id }, data: { dmFailedAt: NOW } });
    expect(await getCurrentUser(user.id)).toEqual({
      id: user.id,
      name: user.name,
      image: null,
      verifiedAt: NOW,
      bannedAt: NOW,
      hubJoinFailedAt: null,
      dmFailedAt: NOW,
      staffRole: null,
      setupStep: null,
      avatarVersion: null,
      theme: "SYSTEM",
      locale: null,
    });
    expect(await getCurrentUser(admin.id)).toMatchObject({ staffRole: "ADMIN" });
  });

  it("returns the version of the avatar copy for the header (§5.14)", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { avatarUpdatedAt: NOW } });
    expect(await getCurrentUser(user.id)).toMatchObject({ avatarVersion: NOW.getTime() });
  });

  it("treats missing, deleted and unlinked users as logged out", async () => {
    expect(await getCurrentUser("missing")).toBeNull();
    const deleted = await createUser();
    await deleteAccount({ userId: deleted.id, uploadDir: tmpdir(), now: NOW });
    expect(await getCurrentUser(deleted.id)).toBeNull();
    // What a login that raced the deletion leaves if undoing it failed (§5.1).
    const unlinked = await createUser();
    await prisma.account.deleteMany({ where: { userId: unlinked.id } });
    await prisma.user.update({ where: { id: unlinked.id }, data: { deletedAt: NOW } });
    expect(await getCurrentUser(unlinked.id)).toBeNull();
  });

  it("tells what an incomplete account still lacks (§5.8)", async () => {
    const legacy = await createUser({ legacy: true });
    expect(await getCurrentUser(legacy.id)).toMatchObject({ setupStep: "COMPLETE_ACCOUNT" });
    await prisma.user.update({ where: { id: legacy.id }, data: { firstName: "Ana" } });
    expect(await getCurrentUser(legacy.id)).toMatchObject({ setupStep: "VERIFY_EMAIL" });
    const fresh = await createUser();
    await prisma.account.deleteMany({ where: { userId: fresh.id } });
    expect(await getCurrentUser(fresh.id)).toMatchObject({ setupStep: "LINK_DISCORD" });
  });
});

describe("listSeedUsers", () => {
  it("lists the seed users by id with their teams", async () => {
    const id = `seed-${NOW.getTime()}-a`;
    await prisma.user.create({
      data: { id, name: "Seed A", email: `${id}@users.uniscrims.invalid` },
    });
    const { team } = await createTeamWithMembers();
    const memberId = `seed-${NOW.getTime()}-b`;
    await prisma.user.create({
      data: { id: memberId, name: "Seed B", email: `${memberId}@users.uniscrims.invalid` },
    });
    await prisma.teamMember.create({ data: { teamId: team.id, userId: memberId, joinedAt: NOW } });
    const seeds = (await listSeedUsers()).filter((seed) =>
      seed.id.startsWith(`seed-${NOW.getTime()}`),
    );
    expect(seeds).toEqual([
      { id, name: "Seed A", teamNames: [] },
      { id: memberId, name: "Seed B", teamNames: [team.name] },
    ]);
  });
});
