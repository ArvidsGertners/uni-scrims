import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import { DELETED_USER_NAME, deletedUserEmail, handleDiscordLogin } from "../src/index.ts";
import { NOW, createSession, createUser } from "./helpers.ts";

afterAll(async () => {
  await prisma.$disconnect();
});

async function tokensOf(userId: string) {
  return prisma.account.findFirstOrThrow({
    where: { userId },
    select: { accessToken: true, refreshToken: true },
  });
}

describe("handleDiscordLogin", () => {
  it("joins the hub with the fresh token and removes the tokens", async () => {
    const user = await createUser();
    const calls: [string, string][] = [];
    await handleDiscordLogin(
      user.id,
      async (discordId, token) => {
        calls.push([discordId, token]);
        return true;
      },
      NOW,
    );
    expect(calls).toEqual([[user.discordId, "access"]]);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.hubJoinFailedAt).toBeNull();
  });

  it("records a failed join", async () => {
    const user = await createUser();
    await handleDiscordLogin(user.id, async () => false, NOW);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.hubJoinFailedAt).toEqual(NOW);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("skips the join for banned users but still removes the tokens", async () => {
    const user = await createUser({ banned: true });
    let called = false;
    await handleDiscordLogin(
      user.id,
      async () => {
        called = true;
        return true;
      },
      NOW,
    );
    expect(called).toBe(false);
    expect(await tokensOf(user.id)).toEqual({ accessToken: null, refreshToken: null });
  });

  it("undoes the profile Better Auth wrote back when the account was deleted during the login", async () => {
    const user = await createUser();
    await createSession(user.id);
    // State after the race: deleteAccount removed the account, Better Auth then restored the profile.
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({ where: { id: user.id }, data: { image: "https://cdn/avatar.png" } });

    await handleDiscordLogin(user.id, async () => true, NOW);

    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: DELETED_USER_NAME,
      email: deletedUserEmail(user.id),
      image: null,
    });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
