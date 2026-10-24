// Team logo (SPEC N-6, ARCHITECTURE §5.11): the captain uploads a PNG or WebP with an alpha channel;
// the server trims transparent margins and stores a 256×256 lossless WebP in TeamLogo.
import { type Prisma, prisma } from "@uni-scrims/db";
import { fileTypeFromBuffer } from "file-type";
import { MAX_LOGO_BYTES } from "../config/uploads.ts";
import { DomainError } from "./errors.ts";
import { lockTeam } from "./locks.ts";
import { requireCaptain, requireUser } from "./permissions.ts";

export { MAX_LOGO_BYTES };

/** Side of the stored square. */
export const LOGO_SIZE = 256;
/** The longer side of the trimmed logo must have at least this many pixels. */
export const MIN_LOGO_CONTENT = 128;
/** Longest side of an uploaded image; together against decompression bombs. */
export const MAX_LOGO_SIDE = 4096;
const MAX_LOGO_PIXELS = MAX_LOGO_SIDE * MAX_LOGO_SIDE;
/** Pixels up to this alpha (of 255) count as transparent, so faint leftovers don't hold a margin. */
export const LOGO_ALPHA_THRESHOLD = 8;

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/webp"]);

function invalid(message: string): DomainError {
  return new DomainError("INVALID", message);
}

export type LogoBox = { left: number; top: number; width: number; height: number };

/**
 * The rectangle around all pixels with alpha above LOGO_ALPHA_THRESHOLD; null if there is none.
 * `alpha` holds one value per pixel, row by row.
 */
export function logoContentBox(alpha: Uint8Array, width: number, height: number): LogoBox | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x]! <= LOGO_ALPHA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Logos processed at once and logos waiting; more uploads are turned away for the moment. */
const LOGO_JOBS_RUNNING = 1;
const LOGO_JOBS_WAITING = 3;
let logoJobs = 0;
const logoQueue: (() => void)[] = [];

/**
 * Runs one logo job at a time: a large upload briefly needs tens of MB and some time on the main
 * thread, and any logged-in user can found a team (§5.11).
 */
async function inLogoQueue<T>(job: () => Promise<T>): Promise<T> {
  if (logoJobs < LOGO_JOBS_RUNNING) {
    logoJobs++;
  } else {
    if (logoQueue.length >= LOGO_JOBS_WAITING) {
      throw new DomainError(
        "CONFLICT",
        "Gerade werden viele Logos hochgeladen. Bitte versuch es gleich noch einmal.",
      );
    }
    // The finishing job hands its slot on, so the count stays.
    await new Promise<void>((resolve) => logoQueue.push(resolve));
  }
  try {
    return await job();
  } finally {
    const next = logoQueue.shift();
    if (next) next();
    else logoJobs--;
  }
}

/**
 * Checks an uploaded logo and returns the image to store: trimmed to its content and fitted into
 * a transparent 256×256 square, so it touches at least two opposite edges. The uploaded bytes
 * themselves are never stored, which also drops all metadata.
 */
export async function processTeamLogo(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (bytes.byteLength === 0) throw invalid("Die Datei ist leer.");
  if (bytes.byteLength > MAX_LOGO_BYTES) throw invalid("Die Datei ist größer als 2 MB.");
  const type = await fileTypeFromBuffer(bytes);
  // file-type names animated PNGs (with an acTL chunk) image/apng.
  if (type?.mime === "image/apng") throw invalid("Animierte Logos gehen nicht.");
  if (!type || !ALLOWED_LOGO_TYPES.has(type.mime)) {
    throw invalid("Erlaubt sind nur PNG und WebP.");
  }
  return inLogoQueue(() => renderTeamLogo(bytes));
}

async function renderTeamLogo(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  // Loaded on first use, so the bot, which shares core, never loads the native module.
  const { default: sharp } = await import("sharp");
  // Every read decodes with the pixel limit and turns the image upright by its EXIF orientation
  // first, as viewers show it; then 8-bit sRGB with alpha, also for 16-bit or grey images.
  const image = () =>
    sharp(bytes, { limitInputPixels: MAX_LOGO_PIXELS, autoOrient: true })
      .toColourspace("srgb")
      .ensureAlpha();
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw invalid("Das Bild lässt sich nicht lesen.");
  }
  if (metadata.width > MAX_LOGO_SIDE || metadata.height > MAX_LOGO_SIDE) {
    throw invalid("Das Bild ist zu groß (höchstens 4096 × 4096 Pixel).");
  }
  if ((metadata.pages ?? 1) > 1) throw invalid("Animierte Logos gehen nicht.");
  if (!metadata.hasAlpha) {
    throw invalid(
      "Das Logo braucht einen durchsichtigen Hintergrund (PNG oder WebP mit Transparenz).",
    );
  }

  // Only the alpha channel comes into JavaScript: one byte per pixel.
  let alpha: { data: Buffer; info: { width: number; height: number } };
  try {
    alpha = await image()
      .extractChannel(3)
      .raw({ depth: "uchar" })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw invalid("Das Bild lässt sich nicht lesen.");
  }
  const box = logoContentBox(alpha.data, alpha.info.width, alpha.info.height);
  if (!box) throw invalid("Das Logo ist komplett durchsichtig.");
  if (Math.max(box.width, box.height) < MIN_LOGO_CONTENT) {
    throw invalid("Das Logo ist zu klein (mindestens 128 Pixel ohne durchsichtigen Rand).");
  }

  const logo = await image()
    .extract(box)
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ lossless: true })
    .toBuffer();
  return new Uint8Array(logo);
}

/** Removes the logo in the caller's transaction, which holds the team lock. */
export async function clearTeamLogo(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
  await tx.teamLogo.deleteMany({ where: { teamId } });
  await tx.team.update({ where: { id: teamId }, data: { logoUpdatedAt: null } });
}

/** URL version of a team's logo, null without one (§5.11). */
export function logoVersion(team: { logoUpdatedAt: Date | null }): number | null {
  return team.logoUpdatedAt?.getTime() ?? null;
}

/** Captain of a team that is not banned; verification is not needed, as for the other team data. */
export async function setTeamLogo(input: {
  userId: string;
  teamId: string;
  file: Uint8Array;
  now: Date;
}): Promise<void> {
  await requireCaptain(input.userId, input.teamId);
  // Image work runs before the transaction, so it holds no lock.
  const data = await processTeamLogo(input.file);
  await prisma.$transaction(async (tx) => {
    // Checked again under the team lock: a dissolved team must not get its logo back.
    await lockTeam(tx, input.teamId);
    await requireCaptain(input.userId, input.teamId, tx);
    await tx.teamLogo.upsert({
      where: { teamId: input.teamId },
      create: { teamId: input.teamId, data },
      update: { data },
    });
    await tx.team.update({ where: { id: input.teamId }, data: { logoUpdatedAt: input.now } });
  });
}

export async function removeTeamLogo(input: { userId: string; teamId: string }): Promise<void> {
  await requireCaptain(input.userId, input.teamId);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    await requireCaptain(input.userId, input.teamId, tx);
    await clearTeamLogo(tx, input.teamId);
  });
}

/**
 * The stored WebP and its version for logged-in users who are not banned, like team cards;
 * dissolved teams have none.
 */
export async function getTeamLogo(input: {
  userId: string;
  teamId: string;
}): Promise<{ data: Uint8Array<ArrayBuffer>; version: number }> {
  await requireUser(input.userId);
  const team = await prisma.team.findFirst({
    where: { id: input.teamId, dissolvedAt: null },
    select: { logoUpdatedAt: true, logo: { select: { data: true } } },
  });
  if (!team?.logo || !team.logoUpdatedAt) throw new DomainError("NOT_FOUND", "Kein Logo.");
  return { data: team.logo.data, version: team.logoUpdatedAt.getTime() };
}
