// Must stay the first import: core reads the environment (e.g. DEV_TIME_OFFSETS) when loaded.
import "./env.ts";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { handleSetup, setupCommand } from "./commands/setup.ts";
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
