// Discord HTTP call for the hub server join (ARCHITECTURE §5.1). No domain logic here.

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
