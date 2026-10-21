// Dev check (ARCHITECTURE §11, phase 1): send one DM to verify the hub assumptions from §5.1 and §8.
// Usage: pnpm bot:test-dm <discordId>
import "../env.ts";
import { DiscordAPIError, REST, Routes } from "discord.js";

const discordId = process.argv[2];
const token = process.env.DISCORD_BOT_TOKEN;
if (!discordId || !/^\d+$/.test(discordId)) {
  console.error("Aufruf: pnpm bot:test-dm <discordId>");
  process.exit(1);
}
if (!token) {
  throw new Error("DISCORD_BOT_TOKEN is not set");
}

const rest = new REST().setToken(token);

try {
  const channel = (await rest.post(Routes.userChannels(), {
    body: { recipient_id: discordId },
  })) as { id: string };
  await rest.post(Routes.channelMessages(channel.id), {
    body: {
      content: "Test-DM von Uni Scrims: Wenn du das liest, kann der Bot dir schreiben.",
      allowed_mentions: { parse: [] },
    },
  });
  console.log(`DM an ${discordId} gesendet.`);
} catch (error) {
  if (error instanceof DiscordAPIError) {
    // 50007: no shared server or DMs from server members are blocked.
    console.error(`DM fehlgeschlagen: Discord-Fehler ${error.code} (${error.message})`);
    process.exit(1);
  }
  throw error;
}
