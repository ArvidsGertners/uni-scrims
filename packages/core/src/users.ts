import { type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

export const DISCORD_PROVIDER = "discord";

export const DELETED_USER_NAME = "Gelöschter Nutzer";

const DELETED_EMAIL_PREFIX = "deleted-";

/**
 * Email of a deleted account (ARCHITECTURE §4). A new placeholder instead of `<discordId>@…`: email
 * is unique, and a later login with the same Discord account creates a new user with the original
 * placeholder. The ban placeholder of a banned user gets the original placeholder back on a login.
 */
export function deletedUserEmail(userId: string): string {
  return `${DELETED_EMAIL_PREFIX}${userId}@users.uniscrims.invalid`;
}

/** The values of a deleted account (§4); deleteAccount and the repairs of a racing login set them. */
export function deletedUserData(userId: string) {
  return {
    name: DELETED_USER_NAME,
    email: deletedUserEmail(userId),
    image: null,
    universityId: null,
    universityOther: null,
    verifiedAt: null,
    hubJoinFailedAt: null,
    dmFailedAt: null,
  } satisfies Prisma.UserUncheckedUpdateInput;
}

/**
 * A banned user that holds nothing but the Discord ID (§4): the ban of a deleted account, or of a
 * Discord account a restored database does not know. Its Discord account row is added by the caller.
 */
export function banPlaceholderData(id: string, bannedAt: Date, now: Date) {
  return {
    id,
    name: DELETED_USER_NAME,
    email: deletedUserEmail(id),
    bannedAt,
    deletedAt: now,
    createdAt: now,
  } satisfies Prisma.UserCreateInput;
}

/**
 * Puts a deleted user whose Discord profile a racing login wrote back onto the deletion values again
 * and ends its sessions (§5.1): from the login hook, and from the sweeper if that failed.
 */
export async function restoreDeletedUser(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: deletedUserData(userId) }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
}

/**
 * Sweeper (§6.3): deleted users that carry a profile again without a Discord link, because the login
 * hook could not undo a racing login (§5.1). A ban placeholder keeps its link and is left alone.
 */
export async function finishInterruptedDeletions(): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      accounts: { none: {} },
      NOT: { email: { startsWith: DELETED_EMAIL_PREFIX } },
    },
    select: { id: true },
  });
  for (const { id } of users) await restoreDeletedUser(id);
  return users.length;
}

/** Deleted and not logged in again since; counts as logged out everywhere. */
export function isDeletedUser(user: { id: string; email: string }): boolean {
  return user.email === deletedUserEmail(user.id);
}

/** The user, unless the account was deleted; for writes that must not touch a deleted account. */
export function notDeletedUserWhere(userId: string) {
  return { id: userId, email: { not: deletedUserEmail(userId) } };
}

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

export function getAdminDiscordIds(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export async function isAdmin(userId: string, db: Db = prisma): Promise<boolean> {
  const discordId = await getDiscordId(userId, db);
  return discordId !== null && getAdminDiscordIds().includes(discordId);
}

/**
 * Header, navigation and the Discord banner. Does not reject banned users. null for a user that
 * requireAccountUser treats as logged out: missing, deleted or without a Discord link (§5.1).
 */
export async function getCurrentUser(userId: string, db: Db = prisma) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      verifiedAt: true,
      bannedAt: true,
      hubJoinFailedAt: true,
      dmFailedAt: true,
    },
  });
  if (!user || isDeletedUser(user)) return null;
  const discordId = await getDiscordId(user.id, db);
  if (!discordId) return null;
  return {
    id: user.id,
    name: user.name,
    image: user.image,
    verifiedAt: user.verifiedAt,
    bannedAt: user.bannedAt,
    hubJoinFailedAt: user.hubJoinFailedAt,
    dmFailedAt: user.dmFailedAt,
    isAdmin: getAdminDiscordIds().includes(discordId),
  };
}

/** Result of the hub server join on login (§5.1): failure sets hubJoinFailedAt, success clears it. */
export async function recordHubJoinResult(
  userId: string,
  joined: boolean,
  now: Date,
  db: Db = prisma,
): Promise<void> {
  // updateMany: a deletion that commits meanwhile keeps hubJoinFailedAt at null (§4).
  await db.user.updateMany({
    where: notDeletedUserWhere(userId),
    data: { hubJoinFailedAt: joined ? null : now },
  });
}

/** An account row without any OAuth token. */
export const NO_OAUTH_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
} satisfies Prisma.AccountUpdateManyMutationInput;

/** Discord tokens are only needed for the hub join and are removed right after it (§5.1). */
export async function clearOAuthTokens(userId: string, db: Db = prisma): Promise<void> {
  await db.account.updateMany({
    where: { userId, providerId: DISCORD_PROVIDER },
    data: NO_OAUTH_TOKENS,
  });
}

/** Seed users have IDs with this prefix; only they can use the dev login. */
export const SEED_USER_PREFIX = "seed-";

/** Dev login only: seed users with their team. */
export async function listSeedUsers(db: Db = prisma) {
  const users = await db.user.findMany({
    where: { id: { startsWith: SEED_USER_PREFIX } },
    orderBy: { id: "asc" },
    select: { id: true, name: true, membership: { select: { team: { select: { name: true } } } } },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    teamName: user.membership?.team.name ?? null,
  }));
}
