import { prisma } from "@uni-scrims/db";
import {
  type DiscordProfile,
  clearOAuthTokens,
  discordProfileData,
  notDeletedUserWhere,
  recordHubJoinResult,
  restoreDeletedUser,
} from "./users.ts";

/** Adds the user to the hub server; resolves to true on success. Must not throw. */
export type HubJoiner = (discordId: string, accessToken: string) => Promise<boolean>;

/** The Discord calls of a login (§5.1, §5.8); the web passes the HTTP implementations. */
export type DiscordLoginCalls = {
  joinHub: HubJoiner;
  /** GET /users/@me with the user's token; null on any error. Must not throw. */
  fetchProfile: (accessToken: string) => Promise<DiscordProfile | null>;
};

/**
 * Runs whenever fresh Discord tokens arrive, after a Discord login and after linking Discord
 * (§5.1, §5.8): take over name and avatar, try to join the hub server (skipped for banned users),
 * record the result, then always remove the tokens. Better Auth no longer writes the profile on a
 * login, so a deleted account (a ban placeholder) gets nothing back.
 */
export async function handleDiscordLogin(
  userId: string,
  discord: DiscordLoginCalls,
  now: Date,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { bannedAt: true, deletedAt: true },
    });
    if (!user) return;
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "discord" },
      select: { accountId: true, accessToken: true },
    });
    if (!account) {
      // The account was deleted while this login ran. Put the user back onto the deletion values and
      // end its sessions (§5.1); if this fails, the sweeper does it (finishInterruptedDeletions).
      if (user.deletedAt) await restoreDeletedUser(userId);
      return;
    }
    if (user.deletedAt || !account.accessToken) return;
    const profile = await discord.fetchProfile(account.accessToken);
    if (profile) {
      // updateMany: a deletion that commits meanwhile keeps the deletion values (§4).
      await prisma.user.updateMany({
        where: notDeletedUserWhere(userId),
        data: discordProfileData(profile),
      });
    }
    if (user.bannedAt) return;
    const joined = await discord.joinHub(account.accountId, account.accessToken);
    await recordHubJoinResult(userId, joined, now);
  } finally {
    await clearOAuthTokens(userId);
  }
}
