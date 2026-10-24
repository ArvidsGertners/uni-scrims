// Copies the Discord avatars of accounts linked before Phase 12 (SPEC N-8, ARCHITECTURE §5.12),
// once after its deploy. New links and Discord logins copy the avatar themselves. On the server:
//   dc run --rm --no-deps -T bot node --import tsx src/scripts/backfill-avatars.ts </dev/null
// Locally: pnpm --filter @uni-scrims/bot backfill-avatars
import "../env.ts";
import { MAX_AVATAR_BYTES, backfillDiscordAvatars } from "@uni-scrims/core";
import { prisma } from "@uni-scrims/db";

const TIMEOUT_MS = 3000;

/** An image from Discord's CDN, at most 1 MB; throws on any failure (as apps/web/lib/discord-avatar.ts). */
async function fetchDiscordImage(url: string): Promise<Uint8Array> {
  if (!url.startsWith("https://cdn.discordapp.com/"))
    throw new Error(`Not a Discord CDN address: ${url}`);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Discord CDN: status ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_AVATAR_BYTES) throw new Error(`Discord CDN: ${length} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_AVATAR_BYTES)
    throw new Error(`Discord CDN: ${bytes.byteLength} bytes`);
  return bytes;
}

try {
  const counts = await backfillDiscordAvatars(fetchDiscordImage, new Date());
  console.log(
    `Profilbilder: ${counts.stored} gespeichert, ${counts.failed} gescheitert (Bild bei Discord geändert oder nicht erreichbar), ${counts.unchanged + counts.removed} übersprungen.`,
  );
} finally {
  await prisma.$disconnect();
}
