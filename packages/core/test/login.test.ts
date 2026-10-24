import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  DELETED_USER_NAME,
  accountCreateProblem,
  banPlaceholderData,
  deletedUserEmail,
  discordLoginUserInfo,
  discordPlaceholderEmail,
  discordProfileData,
  handleDiscordLogin,
} from "../src/index.ts";
import { NOW, createSession, createUser, uid } from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

async function tokensOf(userId: string) {
  return prisma.account.findFirstOrThrow({
    where: { userId },
    select: { accessToken: true, refreshToken: true },
  });
}

/** Discord's profile without an own avatar: nothing to copy (avatars have their own tests). */
const NO_AVATAR = {
  fetchProfile: async () => ({ id: "1", username: "spieler", discriminator: "0", avatar: null }),
  fetchImage: async () => {
    throw new Error("not called without an avatar");
  },
};

/** Records the hub joins. */
function hubJoin(joined = true) {
  const calls: [string, string][] = [];
  const join = async (discordId: string, token: string) => {
    calls.push([discordId, token]);
    return joined;
  };
  return { join, calls };
}

/** A ban placeholder with a Discord link and fresh tokens, as after a new Discord login (§4). */
async function banPlaceholder() {
  const id = uid();
  await prisma.user.create({ data: banPlaceholderData(id, NOW, NOW) });
  await prisma.account.create({
    data: {
      id: `${id}-discord`,
      userId: id,
      providerId: "discord",
      accountId: `9${id.replaceAll(/\D/g, "").slice(0, 15)}`,
      accessToken: "access",
    },
  });
  return id;
}

describe("handleDiscordLogin", () => {
  it("joins the hub with the fresh token and removes the tokens", async () => {
    const user = await createUser();
    const { join, calls } = hubJoin();
    await handleDiscordLogin(user.id, join, NO_AVATAR, NOW);
    expect(calls).toEqual([[user.discordId, "access"]]);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.hubJoinFailedAt).toBeNull();
  });

  it("records a failed join", async () => {
    const user = await createUser();
    await handleDiscordLogin(user.id, hubJoin(false).join, NO_AVATAR, NOW);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.hubJoinFailedAt).toEqual(NOW);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("skips the join for banned users but still removes the tokens", async () => {
    const user = await createUser({ banned: true });
    const { join, calls } = hubJoin();
    await handleDiscordLogin(user.id, join, NO_AVATAR, NOW);
    expect(calls).toEqual([]);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("keeps a ban placeholder's link but does not join for it", async () => {
    const id = await banPlaceholder();
    const { join, calls } = hubJoin();
    await handleDiscordLogin(id, join, NO_AVATAR, NOW);
    expect(calls).toEqual([]);
    expect(await tokensOf(id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("removes a link that finished after the account was deleted (P0-10)", async () => {
    const user = await createUser();
    await createSession(user.id);
    // The link callback trusted the user ID of its OAuth state; the deletion committed meanwhile.
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: NOW, email: deletedUserEmail(user.id), name: DELETED_USER_NAME },
    });
    const { join, calls } = hubJoin();
    await handleDiscordLogin(user.id, join, NO_AVATAR, NOW);
    expect(calls).toEqual([]);
    expect(await prisma.account.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("puts a user deleted during the login back onto the deletion values", async () => {
    const user = await createUser();
    await createSession(user.id);
    // State after the race: deleteAccount set deletedAt and removed the Discord link, a login then
    // wrote the profile back (§5.1).
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: NOW, image: "https://cdn/avatar.png", dmFailedAt: NOW, firstName: "Ana" },
    });

    await handleDiscordLogin(user.id, hubJoin().join, NO_AVATAR, NOW);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedUserEmail(user.id),
      image: null,
      dmFailedAt: null,
      firstName: null,
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("leaves a user without Discord link alone unless it was deleted", async () => {
    const user = await createUser();
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await handleDiscordLogin(user.id, hubJoin().join, NO_AVATAR, NOW);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: user.name,
      email: user.email,
    });
  });
});

describe("discordLoginUserInfo (Better Auth's mapProfileToUser, §5.8)", () => {
  const profile = (id: string) => ({ id, username: "nelly", discriminator: "0", avatar: "abc" });

  it("keeps the address of a linked account and takes name and avatar from Discord", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { email: `x.${uid()}@example.org` } });
    const { email } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await discordLoginUserInfo(profile(user.discordId))).toEqual({
      email,
      name: "nelly",
      image: `https://cdn.discordapp.com/avatars/${user.discordId}/abc.png`,
    });
  });

  it("gives a ban placeholder its own values back, so a login stores nothing", async () => {
    const id = await banPlaceholder();
    const { accountId } = await prisma.account.findFirstOrThrow({ where: { userId: id } });
    expect(await discordLoginUserInfo(profile(accountId))).toEqual({
      email: deletedUserEmail(id),
      name: DELETED_USER_NAME,
      image: undefined,
    });
  });

  it("uses the placeholder for an unlinked Discord ID", async () => {
    const discordId = `8${Date.now()}`;
    expect(await discordLoginUserInfo(profile(discordId))).toMatchObject({
      email: discordPlaceholderEmail(discordId),
      name: "nelly",
    });
  });
});

describe("accountCreateProblem (database hook, §5.8)", () => {
  it("allows a first Discord link and refuses a second one", async () => {
    const user = await createUser();
    expect(await accountCreateProblem({ userId: user.id, providerId: "credential" })).toBeNull();
    expect(await accountCreateProblem({ userId: user.id, providerId: "discord" })).toBe(
      "already linked",
    );
    await prisma.account.deleteMany({ where: { userId: user.id } });
    expect(await accountCreateProblem({ userId: user.id, providerId: "discord" })).toBeNull();
  });

  it("refuses rows for deleted, banned and missing users", async () => {
    const deleted = await createUser();
    await prisma.account.deleteMany({ where: { userId: deleted.id } });
    await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: NOW } });
    expect(await accountCreateProblem({ userId: deleted.id, providerId: "credential" })).toBe(
      "deleted",
    );
    const banned = await createUser({ banned: true });
    expect(await accountCreateProblem({ userId: banned.id, providerId: "credential" })).toBe(
      "banned",
    );
    expect(await accountCreateProblem({ userId: "missing", providerId: "discord" })).toBe(
      "deleted",
    );
  });
});

describe("discordProfileData", () => {
  it("uses the username, with the old discriminator where it still exists", () => {
    const base = { id: "80351110224678912", username: "nelly", avatar: null };
    expect(discordProfileData({ ...base, discriminator: "0" }).name).toBe("nelly");
    expect(discordProfileData({ ...base, discriminator: "1337" }).name).toBe("nelly#1337");
  });

  it("builds the avatar URL like Better Auth, animated and default ones included", () => {
    const base = { id: "80351110224678912", username: "nelly", discriminator: "0" };
    expect(discordProfileData({ ...base, avatar: "a_123" }).image).toBe(
      "https://cdn.discordapp.com/avatars/80351110224678912/a_123.gif",
    );
    // (id >> 22) % 6 for new usernames, discriminator % 5 for old ones.
    expect(discordProfileData({ ...base, avatar: null }).image).toBe(
      `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(base.id) >> BigInt(22)) % 6}.png`,
    );
    expect(discordProfileData({ ...base, discriminator: "1337", avatar: null }).image).toBe(
      "https://cdn.discordapp.com/embed/avatars/2.png",
    );
  });
});
