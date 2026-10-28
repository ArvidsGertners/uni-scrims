// Team logo (SPEC N-6, N-7, ARCHITECTURE §5.11): the captain uploads a PNG or WebP with an alpha
// channel, one per background; the server trims transparent margins and stores a 256×256 lossless
// WebP in TeamLogo.
import { LogoBackground, type Prisma, prisma } from "@uni-scrims/db";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { MAX_LOGO_SIDE, MIN_LOGO_CONTENT } from "../config/limits.ts";
import { MAX_LOGO_BYTES } from "../config/uploads.ts";
import { DomainError } from "./errors.ts";
import { type PlainMessageKey, key } from "./i18n/render.ts";
import { lockTeam } from "./locks.ts";
import { requireCaptain, requireUser } from "./permissions.ts";
import { showcaseTeamWhere } from "./readiness.ts";
import { boardRequestWhere, runningReadyWindowWhere } from "./requests.ts";
import { parseInput } from "./schemas.ts";

export { MAX_LOGO_BYTES };

/** Side of the stored square. */
export const LOGO_SIZE = 256;
export { MAX_LOGO_SIDE, MIN_LOGO_CONTENT };
const MAX_LOGO_PIXELS = MAX_LOGO_SIDE * MAX_LOGO_SIDE;
/** Pixels up to this alpha (of 255) count as transparent, so faint leftovers don't hold a margin. */
export const LOGO_ALPHA_THRESHOLD = 8;

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/webp"]);

function invalid(text: PlainMessageKey): DomainError {
  return new DomainError("INVALID", text);
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
      throw new DomainError("CONFLICT", "logoBusy");
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
  if (bytes.byteLength === 0) throw invalid("fileEmpty");
  if (bytes.byteLength > MAX_LOGO_BYTES) throw invalid("logoTooLarge");
  const type = await fileTypeFromBuffer(bytes);
  // file-type names animated PNGs (with an acTL chunk) image/apng.
  if (type?.mime === "image/apng") throw invalid("logoAnimated");
  if (!type || !ALLOWED_LOGO_TYPES.has(type.mime)) {
    throw invalid("logoType");
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
    throw invalid("imageUnreadable");
  }
  if (metadata.width > MAX_LOGO_SIDE || metadata.height > MAX_LOGO_SIDE) {
    throw invalid("logoTooBig");
  }
  if ((metadata.pages ?? 1) > 1) throw invalid("logoAnimated");
  if (!metadata.hasAlpha) {
    throw invalid("logoNotTransparent");
  }

  // Only the alpha channel comes into JavaScript: one byte per pixel.
  let alpha: { data: Buffer; info: { width: number; height: number } };
  try {
    alpha = await image()
      .extractChannel(3)
      .raw({ depth: "uchar" })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw invalid("imageUnreadable");
  }
  const box = logoContentBox(alpha.data, alpha.info.width, alpha.info.height);
  if (!box) throw invalid("logoFullyTransparent");
  if (Math.max(box.width, box.height) < MIN_LOGO_CONTENT) {
    throw invalid("logoTooSmall");
  }

  const logo = await image()
    .extract(box)
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ lossless: true })
    .toBuffer();
  return new Uint8Array(logo);
}

/** Form values of the background, as the web sends them. */
export const logoBackgroundSchema = z.enum(LogoBackground, key("unknownLogoBackground"));

/** The two logos in display order: for dark backgrounds, then for light ones (SPEC N-7). */
export const LOGO_BACKGROUNDS: readonly LogoBackground[] = [
  LogoBackground.DARK,
  LogoBackground.LIGHT,
];

/** Removes all logos in the caller's transaction, which holds the team lock. */
export async function clearTeamLogo(tx: Prisma.TransactionClient, teamId: string): Promise<void> {
  await tx.teamLogo.deleteMany({ where: { teamId } });
  await tx.team.update({ where: { id: teamId }, data: { logoUpdatedAt: null } });
}

/** URL version of a team's logos, null without any (§5.11). */
export function logoVersion(team: { logoUpdatedAt: Date | null }): number | null {
  return team.logoUpdatedAt?.getTime() ?? null;
}

/** What pages need to show a team's logos: the URL version and which backgrounds have one. */
export type TeamLogoInfo = { version: number; backgrounds: LogoBackground[] };

/** Team fields for teamLogoInfo; the backgrounds come without image bytes. */
export const teamLogoSelect = {
  logoUpdatedAt: true,
  logos: { select: { background: true } },
} satisfies Prisma.TeamSelect;

export function teamLogoInfo(team: {
  logoUpdatedAt: Date | null;
  logos: { background: LogoBackground }[];
}): TeamLogoInfo | null {
  const backgrounds = LOGO_BACKGROUNDS.filter((background) =>
    team.logos.some((logo) => logo.background === background),
  );
  return team.logoUpdatedAt && backgrounds.length > 0
    ? { version: team.logoUpdatedAt.getTime(), backgrounds }
    : null;
}

/** teamLogoInfo for a team row loaded without its logos (findOwnTeam); queries only if needed. */
export async function loadTeamLogoInfo(team: {
  id: string;
  logoUpdatedAt: Date | null;
}): Promise<TeamLogoInfo | null> {
  if (!team.logoUpdatedAt) return null;
  const logos = await prisma.teamLogo.findMany({
    where: { teamId: team.id },
    select: { background: true },
  });
  return teamLogoInfo({ logoUpdatedAt: team.logoUpdatedAt, logos });
}

/** Captain of a team that is not banned; verification is not needed, as for the other team data. */
export async function setTeamLogo(input: {
  userId: string;
  teamId: string;
  background: LogoBackground;
  file: Uint8Array;
  now: Date;
}): Promise<void> {
  await requireCaptain(input.userId, input.teamId);
  const background = parseInput(logoBackgroundSchema, input.background);
  // Image work runs before the transaction, so it holds no lock.
  const data = await processTeamLogo(input.file);
  await prisma.$transaction(async (tx) => {
    // Checked again under the team lock: a dissolved team must not get its logo back.
    await lockTeam(tx, input.teamId);
    await requireCaptain(input.userId, input.teamId, tx);
    await tx.teamLogo.upsert({
      where: { teamId_background: { teamId: input.teamId, background } },
      create: { teamId: input.teamId, background, data },
      update: { data },
    });
    await tx.team.update({ where: { id: input.teamId }, data: { logoUpdatedAt: input.now } });
  });
}

/** Removes one logo; the version moves on while the other one is left, else it is cleared. */
export async function removeTeamLogo(input: {
  userId: string;
  teamId: string;
  background: LogoBackground;
  now: Date;
}): Promise<void> {
  await requireCaptain(input.userId, input.teamId);
  const background = parseInput(logoBackgroundSchema, input.background);
  await prisma.$transaction(async (tx) => {
    await lockTeam(tx, input.teamId);
    await requireCaptain(input.userId, input.teamId, tx);
    const removed = await tx.teamLogo.deleteMany({ where: { teamId: input.teamId, background } });
    // Nothing removed (a stale page): the version stays, so URLs and the admin's view stay valid.
    if (removed.count === 0) return;
    const left = await tx.teamLogo.count({ where: { teamId: input.teamId } });
    await tx.team.update({
      where: { id: input.teamId },
      data: { logoUpdatedAt: left > 0 ? input.now : null },
    });
  });
}

type StoredLogo = { data: Uint8Array<ArrayBuffer>; version: number };

/** The stored WebP for one background of the team matching `where`, and its version. */
async function loadLogo(where: Prisma.TeamWhereInput, chosen: LogoBackground): Promise<StoredLogo> {
  const background = parseInput(logoBackgroundSchema, chosen);
  const team = await prisma.team.findFirst({
    where,
    select: {
      logoUpdatedAt: true,
      logos: { where: { background }, select: { data: true } },
    },
  });
  const logo = team?.logos[0];
  if (!logo || !team.logoUpdatedAt) throw new DomainError("NOT_FOUND", "noLogo");
  return { data: logo.data, version: team.logoUpdatedAt.getTime() };
}

/**
 * The stored WebP for one background and the version, for logged-in users who are not banned,
 * like team cards; dissolved teams have none.
 */
export async function getTeamLogo(input: {
  userId: string;
  teamId: string;
  background: LogoBackground;
}): Promise<StoredLogo> {
  await requireUser(input.userId);
  return loadLogo({ id: input.teamId, dissolvedAt: null }, input.background);
}

/**
 * Without login only the logos the public pages can show (SPEC N-24, §5.26): of teams with a
 * request on the board or, since Phase 31, a running ready window (SPEC N-27), by the board's own
 * rules, and since Phase 38 of teams on the landing page (SPEC N-34, §5.36); others are NOT_FOUND,
 * like a missing logo.
 */
export async function getPublicTeamLogo(input: {
  teamId: string;
  background: LogoBackground;
  now: Date;
}): Promise<StoredLogo> {
  return loadLogo(
    {
      id: input.teamId,
      OR: [
        { requests: { some: boardRequestWhere(input.now) } },
        { readyWindows: { some: runningReadyWindowWhere(input.now) } },
        showcaseTeamWhere(),
      ],
    },
    input.background,
  );
}
