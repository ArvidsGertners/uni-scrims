// Copies of Discord avatars (SPEC N-8, ARCHITECTURE §5.12): the server fetches the avatar once at
// linking and at each Discord login and stores a 128×128 WebP; browsers never load from Discord.
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "@uni-scrims/db";
import { fileTypeFromBuffer } from "file-type";
import { DomainError } from "./errors.ts";
import { lockUser } from "./locks.ts";
import { canSeeAvatar, requireAccountUser } from "./permissions.ts";
import type { DiscordProfile } from "./users.ts";

/** Side of the stored square. */
export const AVATAR_SIZE = 128;
/** Largest answer from Discord's CDN that is processed. */
export const MAX_AVATAR_BYTES = 1024 * 1024;
const MAX_AVATAR_SIDE = 1024;
const AVATAR_TYPES = new Set(["image/png", "image/webp", "image/jpeg", "image/gif"]);
/** Real avatars only; Discord's default avatars live under /embed/avatars/ and are not copied. */
const AVATAR_URL = /^https:\/\/cdn\.discordapp\.com\/avatars\/(\d+)\/(a_)?([0-9a-f]+)\.(png|gif)$/;
/** Pause between two users of the backfill, so Discord's CDN is not hammered. */
const BACKFILL_PAUSE_MS = 200;

/** Fetches an image from Discord's CDN; throws on any failure. Given by the caller: no HTTP in core. */
export type DiscordImageFetcher = (url: string) => Promise<Uint8Array>;

/** The Discord calls a login needs for the avatar, given by the web like the hub join (§5.12). */
export type DiscordAvatarCalls = {
  /** GET /users/@me with the user's access token; throws on any failure. */
  fetchProfile: (accessToken: string) => Promise<DiscordProfile>;
  fetchImage: DiscordImageFetcher;
};

/**
 * The URL to fetch for an avatar address as discordProfileData builds it: a 128 px PNG, so animated
 * avatars arrive as a still image. Null for default avatars and anything else.
 */
export function avatarFetchUrl(image: string | null): string | null {
  const match = image?.match(AVATAR_URL);
  if (!match) return null;
  const [, discordId, animated = "", hash] = match;
  return `https://cdn.discordapp.com/avatars/${discordId}/${animated}${hash}.png?size=${AVATAR_SIZE}`;
}

/**
 * Checks Discord's answer and makes the image to store: 128×128 WebP without metadata. Avatars are
 * small (at most 1 MB and 1024 px), so unlike logos they need no queue (§5.12).
 */
export async function processDiscordAvatar(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new Error(`Avatar has ${bytes.byteLength} bytes`);
  }
  const type = await fileTypeFromBuffer(bytes);
  if (!type || !AVATAR_TYPES.has(type.mime)) {
    throw new Error(`Avatar is ${type?.mime ?? "unknown"}`);
  }
  // Loaded on first use, so the bot only loads the native module when it runs the backfill.
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(bytes).metadata();
  if (metadata.width > MAX_AVATAR_SIDE || metadata.height > MAX_AVATAR_SIDE) {
    throw new Error(`Avatar is ${metadata.width}×${metadata.height}`);
  }
  const avatar = await sharp(bytes, {
    limitInputPixels: MAX_AVATAR_SIDE * MAX_AVATAR_SIDE,
    autoOrient: true,
  })
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
  return new Uint8Array(avatar);
}

export type AvatarSyncResult = "stored" | "removed" | "unchanged" | "failed";

/**
 * Brings the copy in line with an avatar address: a real avatar is fetched and stored, a default
 * avatar (or none) drops the copy. Nothing happens for banned or deleted accounts, and nothing is
 * fetched while the copy already belongs to this address. Fetch and image errors are logged and
 * keep the old copy.
 *
 * `backfill`: only stores while the account still has no copy and the same address, so a slow
 * backfill never overwrites what a Discord login stored meanwhile.
 */
export async function syncDiscordAvatar(
  userId: string,
  image: string | null,
  fetchImage: DiscordImageFetcher,
  now: Date,
  { backfill = false } = {},
): Promise<AvatarSyncResult> {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true, avatarUpdatedAt: true, bannedAt: true, deletedAt: true },
  });
  if (!current || current.bannedAt || current.deletedAt) return "unchanged";
  const url = avatarFetchUrl(image);
  if (!url) {
    if (!current.avatarUpdatedAt) return "unchanged";
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const { count } = await tx.userAvatar.deleteMany({ where: { userId } });
      if (count > 0) {
        await tx.user.update({ where: { id: userId }, data: { avatarUpdatedAt: null } });
      }
    });
    return "removed";
  }
  // The address names the image (Discord's hash), so the same address means the same avatar.
  if (current.avatarUpdatedAt && current.image === image) return "unchanged";
  let data: Uint8Array<ArrayBuffer>;
  try {
    data = await processDiscordAvatar(await fetchImage(url));
  } catch (error) {
    console.warn(`Discord avatar of ${userId} not stored`, error);
    return "failed";
  }
  const stored = await prisma.$transaction(async (tx) => {
    // Checked again under the user lock: a deletion or ban that committed during the download
    // gets no copy (P0-10), and a backfill yields to a login that was faster.
    await lockUser(tx, userId);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { image: true, avatarUpdatedAt: true, bannedAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.bannedAt) return false;
    if (backfill && (user.avatarUpdatedAt || user.image !== image)) return false;
    await tx.userAvatar.upsert({ where: { userId }, create: { userId, data }, update: { data } });
    await tx.user.update({ where: { id: userId }, data: { avatarUpdatedAt: now } });
    return true;
  });
  return stored ? "stored" : "unchanged";
}

/**
 * Copies the avatars of accounts linked before Phase 12, one after another (script
 * backfill-avatars). Old addresses whose avatar changed since fail and keep the initials.
 */
export async function backfillDiscordAvatars(
  fetchImage: DiscordImageFetcher,
  now: Date,
  pauseMs = BACKFILL_PAUSE_MS,
): Promise<Record<AvatarSyncResult, number>> {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      bannedAt: null,
      avatarUpdatedAt: null,
      image: { startsWith: "https://cdn.discordapp.com/avatars/" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, image: true },
  });
  const counts: Record<AvatarSyncResult, number> = {
    stored: 0,
    removed: 0,
    unchanged: 0,
    failed: 0,
  };
  for (const [index, user] of users.entries()) {
    if (index > 0 && pauseMs > 0) await sleep(pauseMs);
    counts[await syncDiscordAvatar(user.id, user.image, fetchImage, now, { backfill: true })]++;
  }
  return counts;
}

/**
 * The stored avatar and its version. Whoever may not see it gets NOT_FOUND like a missing one, so
 * nobody can find out who has an avatar.
 */
export async function getUserAvatar(input: {
  viewerId: string;
  userId: string;
}): Promise<{ data: Uint8Array<ArrayBuffer>; version: number }> {
  const viewer = await requireAccountUser(input.viewerId);
  const notFound = new DomainError("NOT_FOUND", "Kein Profilbild.");
  if (!(await canSeeAvatar(viewer, input.userId))) throw notFound;
  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null },
    select: { avatarUpdatedAt: true, avatar: { select: { data: true } } },
  });
  if (!user?.avatar || !user.avatarUpdatedAt) throw notFound;
  return { data: user.avatar.data, version: user.avatarUpdatedAt.getTime() };
}
