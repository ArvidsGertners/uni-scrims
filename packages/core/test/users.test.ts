import { prisma } from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  clearOAuthTokens,
  findUserByDiscordId,
  getAdminDiscordIds,
  getDiscordId,
  recordHubJoinResult,
} from "../src/index.ts";
import { NOW, createUser } from "./helpers.ts";

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

describe("getAdminDiscordIds", () => {
  it("parses the comma-separated list", () => {
    expect(getAdminDiscordIds({ ADMIN_DISCORD_IDS: " 1, 2 ,,3" })).toEqual(["1", "2", "3"]);
    expect(getAdminDiscordIds({})).toEqual([]);
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
