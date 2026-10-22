// Must stay the first import: core reads the environment (e.g. DEV_TIME_OFFSETS) when loaded.
import "./env.ts";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { createDeliver } from "./outbox/deliver.ts";
import { runOutboxLoop } from "./outbox/loop.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

const token = requireEnv("DISCORD_BOT_TOKEN");
// Links in bot messages point here.
const baseUrl = requireEnv("PUBLIC_BASE_URL");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// once: reconnects do not emit ClientReady again, so the loop starts exactly once.
client.once(Events.ClientReady, (ready) => {
  console.log(`Bot eingeloggt als ${ready.user.tag}`);
  void runOutboxLoop(createDeliver(client.rest, baseUrl));
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} empfangen, Bot wird beendet`);
  await client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(token);
