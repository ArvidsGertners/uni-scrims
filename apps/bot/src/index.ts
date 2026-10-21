import "./env.ts";
import { Client, Events, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  throw new Error("DISCORD_BOT_TOKEN is not set");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => {
  console.log(`Bot eingeloggt als ${ready.user.tag}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} empfangen, Bot wird beendet`);
  await client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(token);
