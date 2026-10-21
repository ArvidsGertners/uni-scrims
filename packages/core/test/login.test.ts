import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import { handleDiscordLogin } from "../src/index.ts";
import { NOW, createUser } from "./helpers.ts";

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
});
