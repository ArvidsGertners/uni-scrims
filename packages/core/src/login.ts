import { prisma } from "@uni-scrims/db";
import { clearOAuthTokens, recordHubJoinResult } from "./users.ts";

/** Adds the user to the hub server; resolves to true on success. Must not throw. */
export type HubJoiner = (discordId: string, accessToken: string) => Promise<boolean>;

/**
 * Runs after every Discord login (§5.1): try to join the hub server (skipped for banned users),
 * record the result, then always remove the Discord tokens.
 */
export async function handleDiscordLogin(
  userId: string,
  joinHub: HubJoiner,
  now: Date,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { bannedAt: true },
    });
    if (!user || user.bannedAt) return;
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "discord" },
      select: { accountId: true, accessToken: true },
    });
    const joined = account?.accessToken
      ? await joinHub(account.accountId, account.accessToken)
      : false;
    await recordHubJoinResult(userId, joined, now);
  } finally {
    await clearOAuthTokens(userId);
  }
}
