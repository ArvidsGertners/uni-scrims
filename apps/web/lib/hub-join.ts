// Discord HTTP calls of a login: the hub server join (ARCHITECTURE §5.1) and the profile for name and
// avatar (§5.8). No domain logic here.
import type { DiscordProfile } from "@uni-scrims/core";

const JOIN_TIMEOUT_MS = 5000;

/** PUT /guilds/{HUB_GUILD_ID}/members/{discordId}; 201 = joined, 204 = already a member. Never throws. */
export async function joinHubGuild(discordId: string, accessToken: string): Promise<boolean> {
  const guildId = process.env.HUB_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) {
    console.warn("Hub join skipped: HUB_GUILD_ID or DISCORD_BOT_TOKEN is not set");
    return false;
  }
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
      {
        method: "PUT",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
        signal: AbortSignal.timeout(JOIN_TIMEOUT_MS),
      },
    );
    if (response.status === 201 || response.status === 204) return true;
    console.warn(`Hub join failed with status ${response.status}: ${await response.text()}`);
    return false;
  } catch (error) {
    console.warn("Hub join failed", error);
    return false;
  }
}

/** GET /users/@me with the user's token (scope identify). Never throws; null on any error. */
export async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile | null> {
  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(JOIN_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`Discord profile request failed with status ${response.status}`);
      return null;
    }
    const profile = (await response.json()) as Partial<DiscordProfile>;
    if (typeof profile.id !== "string" || typeof profile.username !== "string") return null;
    return {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator ?? null,
      avatar: profile.avatar ?? null,
    };
  } catch (error) {
    console.warn("Discord profile request failed", error);
    return null;
  }
}
