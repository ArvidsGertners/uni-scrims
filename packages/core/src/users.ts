import { prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

const DISCORD_PROVIDER = "discord";

// The Discord user ID lives in account.accountId (ARCHITECTURE §4); there is no column on User.
export async function getDiscordId(userId: string, db: Db = prisma): Promise<string | null> {
  const account = await db.account.findFirst({
    where: { userId, providerId: DISCORD_PROVIDER },
    select: { accountId: true },
  });
  return account?.accountId ?? null;
}

export async function findUserByDiscordId(discordId: string, db: Db = prisma) {
  const account = await db.account.findFirst({
    where: { providerId: DISCORD_PROVIDER, accountId: discordId },
    select: { user: true },
  });
  return account?.user ?? null;
}

export function getAdminDiscordIds(env: { ADMIN_DISCORD_IDS?: string } = process.env): string[] {
  return (env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export async function isAdmin(userId: string, db: Db = prisma): Promise<boolean> {
  const discordId = await getDiscordId(userId, db);
  return discordId !== null && getAdminDiscordIds().includes(discordId);
}

/** Header, navigation and the Discord banner; null if the user does not exist. Does not reject banned users. */
export async function getCurrentUser(userId: string, db: Db = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      image: true,
      verifiedAt: true,
      bannedAt: true,
      hubJoinFailedAt: true,
      dmFailedAt: true,
    },
  });
  if (!user) return null;
  return { ...user, isAdmin: await isAdmin(userId, db) };
}

/** Result of the hub server join on login (§5.1): failure sets hubJoinFailedAt, success clears it. */
export async function recordHubJoinResult(
  userId: string,
  joined: boolean,
  now: Date,
  db: Db = prisma,
): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { hubJoinFailedAt: joined ? null : now },
  });
}

/** Discord tokens are only needed for the hub join and are removed right after it (§5.1). */
export async function clearOAuthTokens(userId: string, db: Db = prisma): Promise<void> {
  await db.account.updateMany({
    where: { userId, providerId: DISCORD_PROVIDER },
    data: {
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  });
}
