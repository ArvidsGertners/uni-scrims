import { prisma } from "@uni-scrims/db";
import {
  DISCORD_PROVIDER,
  clearOAuthTokens,
  recordHubJoinResult,
  restoreDeletedUser,
} from "./users.ts";

/** Adds the user to the hub server; resolves to true on success. Must not throw. */
export type HubJoiner = (discordId: string, accessToken: string) => Promise<boolean>;

/**
 * Runs whenever fresh Discord tokens arrive, after a Discord login and after linking Discord
 * (§5.1, §5.8): try to join the hub server (skipped for banned and deleted users), record the
 * result, then always remove the tokens. Name and avatar Better Auth writes itself
 * (discordLoginUserInfo).
 */
export async function handleDiscordLogin(
  userId: string,
  joinHub: HubJoiner,
  now: Date,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { bannedAt: true, deletedAt: true },
    });
    if (!user) return;
    const account = await prisma.account.findFirst({
      where: { userId, providerId: DISCORD_PROVIDER },
      select: { accountId: true, accessToken: true },
    });
    if (!account) {
      // The account was deleted while this login ran. Put the user back onto the deletion values and
      // end its sessions (§5.1); if this fails, the sweeper does it (finishInterruptedDeletions).
      if (user.deletedAt) await restoreDeletedUser(userId);
      return;
    }
    if (user.deletedAt) {
      // Only a ban placeholder keeps its Discord link after a deletion. A link that finished after
      // the deletion (the database hook checked too early) must not tie the Discord ID to the
      // anonymized account (P0-10), so it goes again.
      if (!user.bannedAt) {
        await prisma.$transaction([
          prisma.account.deleteMany({ where: { userId } }),
          prisma.session.deleteMany({ where: { userId } }),
        ]);
      }
      return;
    }
    if (user.bannedAt || !account.accessToken) return;
    const joined = await joinHub(account.accountId, account.accessToken);
    await recordHubJoinResult(userId, joined, now);
  } finally {
    await clearOAuthTokens(userId);
  }
}
