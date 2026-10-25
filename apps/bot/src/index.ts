// Must stay the first import: core reads the environment (e.g. DEV_TIME_OFFSETS) when loaded.
import "./env.ts";
import { setTimeout as sleep } from "node:timers/promises";
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import {
  discordAppLocale,
  handleSetup,
  handleSetupAutocomplete,
  setupCommand,
} from "./commands/setup.ts";
import { SETUP_TEXTS } from "./i18n/setup.ts";
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
// /setup refuses the hub server by this ID (§6.4); without it, the hub could be linked unnoticed.
requireEnv("HUB_GUILD_ID");
// Notification mails (§5.17); outside production sendMail only logs or redirects them.
if (process.env.NODE_ENV === "production") {
  requireEnv("SMTP_HOST");
  requireEnv("MAIL_FROM");
}

const LOGIN_RETRY_MS = 60 * 1000;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// The sweeper needs no Discord connection: deadlines, evaluations and the purges of sessions and
// tokens go on while the login fails (§6.3). The bot runs as exactly one instance (§6.2).
void runSweeperLoop();

// once: reconnects do not emit ClientReady again, so the sender starts exactly once.
client.once(Events.ClientReady, (ready) => {
  console.log(`Bot eingeloggt als ${ready.user.tag}`);
  void runOutboxLoop(createDeliver(client.rest, baseUrl));
  // Global and idempotent: overwrites the command list with /setup on every start.
  ready.application.commands
    .set([setupCommand])
    .catch((error: unknown) => console.error("Could not register /setup", error));
});

// /setup is the only interaction, with suggestions for its team option; buttons in bot messages are
// links into the web app.
client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isAutocomplete() && interaction.commandName === setupCommand.name) {
    handleSetupAutocomplete(interaction).catch((error: unknown) => {
      // Without an answer Discord shows no suggestions; the command itself still works.
      console.error("/setup suggestions failed", error);
    });
    return;
  }
  if (!interaction.isChatInputCommand() || interaction.commandName !== setupCommand.name) return;
  handleSetup(interaction, baseUrl).catch(async (error: unknown) => {
    console.error("/setup failed", error);
    // Without the account (which may be what failed), in the language of the Discord app (§5.22).
    const content = SETUP_TEXTS[discordAppLocale(interaction.locale)].failed;
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

// Retried instead of ending the process, so the sweeper keeps running; the admin page shows the
// sender as stopped meanwhile.
for (;;) {
  try {
    await client.login(token);
    break;
  } catch (error) {
    console.error(`Discord login failed, next try in ${LOGIN_RETRY_MS / 1000} s`, error);
    await sleep(LOGIN_RETRY_MS);
  }
}
