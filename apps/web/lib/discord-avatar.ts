// Discord HTTP calls for the avatar copy (ARCHITECTURE §5.12). No domain logic here.
import { type DiscordProfile, MAX_AVATAR_BYTES } from "@uni-scrims/core";

const TIMEOUT_MS = 3000;
const CDN = "https://cdn.discordapp.com/";

/** GET /users/@me with the user's access token (scope identify); throws on any failure. */
export async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile> {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Discord profile: status ${response.status}`);
  const profile = (await response.json()) as DiscordProfile;
  return {
    id: profile.id,
    username: profile.username,
    discriminator: profile.discriminator ?? null,
    avatar: profile.avatar ?? null,
  };
}

/** An image from Discord's CDN, at most 1 MB; throws on any failure. */
export async function fetchDiscordImage(url: string): Promise<Uint8Array> {
  if (!url.startsWith(CDN)) throw new Error(`Not a Discord CDN address: ${url}`);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Discord CDN: status ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_AVATAR_BYTES) throw new Error(`Discord CDN: ${length} bytes`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_AVATAR_BYTES)
    throw new Error(`Discord CDN: ${bytes.byteLength} bytes`);
  return bytes;
}
