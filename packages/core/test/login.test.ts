import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  DELETED_USER_NAME,
  type DiscordLoginCalls,
  type DiscordProfile,
  banPlaceholderData,
  deletedUserEmail,
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

/** Records the calls; the profile has the user's Discord ID. */
function discordCalls(
  options: { joined?: boolean; profile?: Partial<DiscordProfile> | null } = {},
) {
  const joins: [string, string][] = [];
  const profileTokens: string[] = [];
  const calls: DiscordLoginCalls = {
    joinHub: async (discordId, token) => {
      joins.push([discordId, token]);
      return options.joined ?? true;
    },
    fetchProfile: async (token) => {
      profileTokens.push(token);
      if (options.profile === null) return null;
      return {
        id: "1",
        username: "neuername",
        discriminator: "0",
        avatar: "abc",
        ...options.profile,
      };
    },
  };
  return { calls, joins, profileTokens };
}

describe("handleDiscordLogin", () => {
  it("takes over name and avatar, joins the hub with the fresh token and removes the tokens", async () => {
    const user = await createUser();
    const { calls, joins, profileTokens } = discordCalls({ profile: { id: user.discordId } });
    await handleDiscordLogin(user.id, calls, NOW);
    expect(joins).toEqual([[user.discordId, "access"]]);
    expect(profileTokens).toEqual(["access"]);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: "neuername",
      image: `https://cdn.discordapp.com/avatars/${user.discordId}/abc.png`,
      hubJoinFailedAt: null,
      // The address of the account stays (§5.8).
      email: user.email,
    });
  });

  it("records a failed join and keeps the name without a profile", async () => {
    const user = await createUser();
    await handleDiscordLogin(user.id, discordCalls({ joined: false, profile: null }).calls, NOW);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row).toMatchObject({ hubJoinFailedAt: NOW, name: user.name });
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("updates banned users' profile but skips the join and still removes the tokens", async () => {
    const user = await createUser({ banned: true });
    const { calls, joins } = discordCalls();
    await handleDiscordLogin(user.id, calls, NOW);
    expect(joins).toEqual([]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(
      "neuername",
    );
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("writes nothing back onto a ban placeholder that logs in again", async () => {
    const id = uid();
    await prisma.user.create({ data: banPlaceholderData(id, NOW, NOW) });
    await prisma.account.create({
      data: {
        id: `${id}-discord`,
        userId: id,
        providerId: "discord",
        accountId: "777",
        accessToken: "access",
      },
    });
    const { calls, joins, profileTokens } = discordCalls();
    await handleDiscordLogin(id, calls, NOW);
    expect([joins, profileTokens]).toEqual([[], []]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedUserEmail(id),
      image: null,
    });
    expect(await tokensOf(id)).toEqual({ accessToken: null, refreshToken: null });
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

    await handleDiscordLogin(user.id, discordCalls().calls, NOW);

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
    await handleDiscordLogin(user.id, discordCalls().calls, NOW);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: user.name,
      email: user.email,
    });
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
