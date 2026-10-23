import { prisma } from "@uni-scrims/db";
import { clearOAuthTokens, recordHubJoinResult, restoreDeletedUser } from "./users.ts";

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
    if (!user) return;
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "discord" },
      select: { accountId: true, accessToken: true },
    });
    if (!account) {
      // The account was deleted while this login ran: Better Auth wrote the Discord profile back
      // onto the anonymized user. Undo that and end the new session (ARCHITECTURE §5.1); if this
      // fails, the sweeper does it (finishInterruptedDeletions).
      await restoreDeletedUser(userId);
      return;
    }
    if (user.bannedAt) return;
    const joined = account.accessToken
      ? await joinHub(account.accountId, account.accessToken)
      : false;
    await recordHubJoinResult(userId, joined, now);
  } finally {
    await clearOAuthTokens(userId);
  }
}
