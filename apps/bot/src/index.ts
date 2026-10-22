// Must stay the first import: core reads the environment (e.g. DEV_TIME_OFFSETS) when loaded.
import "./env.ts";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { handleSetup, setupCommand } from "./commands/setup.ts";
import { createDeliver } from "./outbox/deliver.ts";
import { runOutboxLoop } from "./outbox/loop.ts";
import { runSweeperLoop } from "./sweeper/loop.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

/** Links in bot messages point here; the web app runs at the root of an http(s) origin. */
function requirePublicBaseUrl(): string {
  const value = requireEnv("PUBLIC_BASE_URL");
  const url = URL.canParse(value) ? new URL(value) : null;
  if (!url || !["http:", "https:"].includes(url.protocol) || url.pathname !== "/") {
    throw new Error(`PUBLIC_BASE_URL must be an origin like https://example.de, got "${value}"`);
  }
  return url.origin;
}

const token = requireEnv("DISCORD_BOT_TOKEN");
// Checked at start: a broken URL would otherwise fail every message until it is marked FAILED.
const baseUrl = requirePublicBaseUrl();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// once: reconnects do not emit ClientReady again, so each loop starts exactly once. Sender and
// sweeper run side by side; the bot runs as exactly one instance (§6.2).
client.once(Events.ClientReady, (ready) => {
  console.log(`Bot eingeloggt als ${ready.user.tag}`);
  void runOutboxLoop(createDeliver(client.rest, baseUrl));
  void runSweeperLoop();
  // Global and idempotent: overwrites the command list with /setup on every start.
  ready.application.commands
    .set([setupCommand])
    .catch((error: unknown) => console.error("Could not register /setup", error));
});

// /setup is the only interaction; buttons in bot messages are links into the web app.
client.on(Events.InteractionCreate, (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== setupCommand.name) return;
  handleSetup(interaction, baseUrl).catch(async (error: unknown) => {
    console.error("/setup failed", error);
    const content = "Etwas ist schiefgelaufen. Bitte versuch es später erneut.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    } catch {
      // The interaction may have expired; nothing left to tell the user.
    }
  });
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} empfangen, Bot wird beendet`);
  await client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(token);
