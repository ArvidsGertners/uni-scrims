import { type Prisma, prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { fromDbLocale } from "./i18n/locale.ts";
import { isReservedEmail } from "./schemas.ts";

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
    firstName: null,
    lastName: null,
    staffRole: null,
    twoFactorEnabled: false,
    avatarUpdatedAt: null,
    theme: "SYSTEM",
    rank: null,
    locale: null,
    activeTeamId: null,
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

/** Shown until Discord is linked, never the real name (§5.8). */
export const NEW_ACCOUNT_NAME = "Neues Konto";

/** The placeholder email Better Auth needs for a Discord profile without one (§5.1). */
export function discordPlaceholderEmail(discordId: string): string {
  return `${discordId}@users.uniscrims.invalid`;
}

/** Deleted and not logged in again since; counts as logged out everywhere. */
export function isDeletedUser(user: { id: string; email: string }): boolean {
  return user.email === deletedUserEmail(user.id);
}

/**
 * Counts as logged out (§5.1, §5.8): a deleted account, or one with deletedAt but without a Discord
 * link, which a login that raced the deletion left behind. A new account without Discord is not
 * logged out, only incomplete (accountSetupStep).
 */
export function isLoggedOutUser(
  user: { id: string; email: string; deletedAt: Date | null },
  discordId: string | null,
): boolean {
  return isDeletedUser(user) || (user.deletedAt !== null && discordId === null);
}

/** What a logged-in account still lacks, in this order (ARCHITECTURE §5.8). */
export type AccountSetupStep = "COMPLETE_ACCOUNT" | "VERIFY_EMAIL" | "LINK_DISCORD";

/**
 * null when the account is complete. Accounts from before Phase 7 have no real name yet; a new or
 * completed account must confirm its address and then link Discord.
 */
export function accountSetupStep(
  user: { firstName: string | null; emailVerified: boolean },
  hasDiscord: boolean,
): AccountSetupStep | null {
  if (!user.firstName) return "COMPLETE_ACCOUNT";
  if (!user.emailVerified) return "VERIFY_EMAIL";
  return hasDiscord ? null : "LINK_DISCORD";
}

/** The Discord profile fields used for name and avatar (§5.8). */
export type DiscordProfile = {
  id: string;
  username: string;
  discriminator: string | null;
  avatar: string | null;
};

/**
 * Name and avatar from the Discord profile, as Better Auth 1.7.12 builds the image. The name is the
 * username, not the display name: captains find the opposing captain on Discord by it (SPEC P0-6).
 * Accounts not yet migrated to unique usernames are only unique with their discriminator.
 */
export function discordProfileData(profile: DiscordProfile) {
  const legacyTag = profile.discriminator && profile.discriminator !== "0";
  const name = legacyTag ? `${profile.username}#${profile.discriminator}` : profile.username;
  let image: string;
  if (profile.avatar) {
    const format = profile.avatar.startsWith("a_") ? "gif" : "png";
    image = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
  } else {
    const index = legacyTag
      ? Number.parseInt(profile.discriminator!, 10) % 5
      : Number(BigInt(profile.id) >> BigInt(22)) % 6;
    image = `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  return { name, image };
}

/**
 * Where a notification mail may go (§5.17): a confirmed address, not one of the placeholders
 * (accounts from before Phase 7 until completed, deleted accounts); else null.
 */
export function deliverableEmail(user: { email: string; emailVerified: boolean }): string | null {
  return user.emailVerified && !isReservedEmail(user.email) ? user.email : null;
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

/**
 * What Better Auth writes onto the user on a Discord login or link (`mapProfileToUser`, §5.8):
 * name and avatar from Discord, but always the account's own address, since Better Auth 1.7.12 would
 * also overwrite the email. A deleted account (a ban placeholder) gets its own values back, so a new
 * login stores nothing. An unlinked Discord ID gets the placeholder; it never reaches a user, as a
 * Discord login creates none and linking keeps the address.
 */
export async function discordLoginUserInfo(profile: DiscordProfile, db: Db = prisma) {
  const user = await findUserByDiscordId(profile.id, db);
  if (!user) return { email: discordPlaceholderEmail(profile.id), ...discordProfileData(profile) };
  // undefined leaves the avatar as it is (null on a placeholder); Better Auth takes no null here.
  if (user.deletedAt) return { email: user.email, name: user.name, image: user.image ?? undefined };
  return { email: user.email, ...discordProfileData(profile) };
}

/**
 * Whether Better Auth may create this account row (database hook, §5.8): never for a deleted or
 * banned user (a link or password reset that finishes after the deletion or ban), and Discord only
 * once per user. Unique indexes back this up.
 */
export async function accountCreateProblem(
  account: { userId: string; providerId: string },
  db: Db = prisma,
): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: account.userId },
    select: { id: true, email: true, deletedAt: true, bannedAt: true },
  });
  if (!user || user.deletedAt || isDeletedUser(user)) return "deleted";
  if (user.bannedAt) return "banned";
  const existing = await db.account.findFirst({
    where: { userId: user.id, providerId: account.providerId },
    select: { id: true },
  });
  return existing ? "already linked" : null;
}

/** URL version of a user's avatar copy, null without one (§5.12). */
export function avatarVersion(user: { avatarUpdatedAt: Date | null }): number | null {
  return user.avatarUpdatedAt?.getTime() ?? null;
}

/**
 * Header, navigation and the Discord banner. Does not reject banned users. null for a user that
 * requireAccountUser treats as logged out (isLoggedOutUser). setupStep tells what the account still
 * lacks (§5.8).
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
      deletedAt: true,
      firstName: true,
      emailVerified: true,
      staffRole: true,
      avatarUpdatedAt: true,
      theme: true,
      locale: true,
    },
  });
  if (!user) return null;
  const discordId = await getDiscordId(user.id, db);
  if (isLoggedOutUser(user, discordId)) return null;
  return {
    id: user.id,
    name: user.name,
    image: user.image,
    verifiedAt: user.verifiedAt,
    bannedAt: user.bannedAt,
    hubJoinFailedAt: user.hubJoinFailedAt,
    dmFailedAt: user.dmFailedAt,
    /** Shows the admin link; the admin pages check the role per area themselves (§5.9). */
    staffRole: user.staffRole,
    setupStep: accountSetupStep(user, discordId !== null),
    /** For the avatar next to "Konto" (§5.14). */
    avatarVersion: avatarVersion(user),
    /** The chosen design, set on <html> by the root layout (§5.16). */
    theme: user.theme,
    /** The chosen language, null if never chosen; it comes before cookie and browser (§5.21). */
    locale: fromDbLocale(user.locale),
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

/** Dev login only: seed users with their teams. */
export async function listSeedUsers(db: Db = prisma) {
  const users = await db.user.findMany({
    where: { id: { startsWith: SEED_USER_PREFIX } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      memberships: {
        where: { team: { dissolvedAt: null } },
        orderBy: { joinedAt: "asc" },
        select: { team: { select: { name: true } } },
      },
    },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    teamNames: user.memberships.map(({ team }) => team.name),
  }));
}
