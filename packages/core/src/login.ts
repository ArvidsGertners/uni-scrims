import { prisma } from "@uni-scrims/db";
import { type DiscordAvatarCalls, syncDiscordAvatar } from "./user-avatar.ts";
import {
  DISCORD_PROVIDER,
  clearOAuthTokens,
  discordProfileData,
  recordHubJoinResult,
  restoreDeletedUser,
} from "./users.ts";

/** Adds the user to the hub server; resolves to true on success. Must not throw. */
export type HubJoiner = (discordId: string, accessToken: string) => Promise<boolean>;

/**
 * Runs whenever fresh Discord tokens arrive, after a Discord login and after linking Discord
 * (§5.1, §5.8): try to join the hub server and read the current profile (both skipped for banned
 * and deleted users), record the result, always remove the tokens, then copy the avatar (§5.12).
 * Name and avatar address Better Auth writes itself (discordLoginUserInfo), after this hook.
 */
export async function handleDiscordLogin(
  userId: string,
  joinHub: HubJoiner,
  avatar: DiscordAvatarCalls,
  now: Date,
): Promise<void> {
  // The avatar address of Discord's current profile; undefined while not loaded.
  let avatarImage: string | null | undefined;
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
    const token = account.accessToken;
    // Better Auth writes the new avatar address only after this hook, so it comes from Discord.
    const [joined, profile] = await Promise.all([
      joinHub(account.accountId, token),
      avatar.fetchProfile(token).catch((error: unknown) => {
        console.warn(`Discord profile of ${userId} not loaded`, error);
        return null;
      }),
    ]);
    await recordHubJoinResult(userId, joined, now);
    if (profile) avatarImage = discordProfileData(profile).image;
  } finally {
    await clearOAuthTokens(userId);
  }
  // The CDN needs no token. Failures keep the old copy and never stop the login.
  if (avatarImage !== undefined) {
    await syncDiscordAvatar(userId, avatarImage, avatar.fetchImage, now);
  }
}
