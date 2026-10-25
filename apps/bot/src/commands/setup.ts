// /setup (ARCHITECTURE §6.4): links the server and a text channel with one of the caller's teams.
// Besides the link buttons this is the bot's only interaction (SPEC P0-7), with suggestions for its
// team option (SPEC N-17). Who may do it is decided in core.
import {
  type DomainError,
  findUserByDiscordId,
  fromDbLocale,
  isDomainError,
  linkTeamChannel,
  listCaptainTeamsForDiscordUser,
  renderMessage,
} from "@uni-scrims/core";
import type { Locale } from "@uni-scrims/core/config/locale";
import {
  type AutocompleteInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  Locale as DiscordLocale,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { SETUP_TEXTS } from "../i18n/setup.ts";
import { plain } from "../messages/common.ts";

/** German is Discord's default; English Discord apps show the English descriptions (§5.22). */
function english(text: string) {
  return { [DiscordLocale.EnglishGB]: text, [DiscordLocale.EnglishUS]: text };
}

const { de, en } = SETUP_TEXTS;

export const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription(de.command)
  .setDescriptionLocalizations(english(en.command))
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription(de.channelOption)
      .setDescriptionLocalizations(english(en.channelOption))
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  )
  // Only needed for captains of several teams (SPEC N-17).
  .addStringOption((option) =>
    option
      .setName("team")
      .setDescription(de.teamOption)
      .setDescriptionLocalizations(english(en.teamOption))
      .setAutocomplete(true),
  );

/** The language of the Discord app: English for any English variant, German otherwise. */
export function discordAppLocale(discordLocale: string): Locale {
  return discordLocale.startsWith("en") ? "en" : "de";
}

/**
 * The language of the answers (§5.22): the account's, without one the Discord app's. The test post
 * goes to the team channel in the captain's language, i.e. the account's, German without one.
 */
export function setupLocales(
  account: { locale: Locale | null } | null,
  discordLocale: string,
): { reply: Locale; post: Locale } {
  return {
    reply: account?.locale ?? discordAppLocale(discordLocale),
    post: account?.locale ?? "de",
  };
}

/** Discord allows at most 100 characters per suggestion name. */
const MAX_CHOICE_NAME = 100;

/** Suggestions for the team option: the caller's teams as captain that are not banned. */
export async function handleSetupAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const teams = await listCaptainTeamsForDiscordUser(
    interaction.user.id,
    interaction.options.getFocused(),
  );
  await interaction.respond(
    teams.map((team) => ({ name: team.name.slice(0, MAX_CHOICE_NAME), value: team.id })),
  );
}

/** What the bot needs in the channel to post embeds. */
const REQUIRED_PERMISSIONS = [
  { flag: PermissionFlagsBits.ViewChannel, key: "viewChannel" },
  { flag: PermissionFlagsBits.SendMessages, key: "sendMessages" },
  { flag: PermissionFlagsBits.EmbedLinks, key: "embedLinks" },
] as const;

/** The answer to a refused /setup; core's texts, except for users without an account. */
export function setupErrorText(error: DomainError, baseUrl: string, locale: Locale): string {
  if (error.code === "UNAUTHENTICATED") return SETUP_TEXTS[locale].noAccount(`${baseUrl}/register`);
  return renderMessage(error.text, locale);
}

export async function handleSetup(
  interaction: ChatInputCommandInteraction,
  baseUrl: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const user = await findUserByDiscordId(interaction.user.id);
  const locales = setupLocales(
    user ? { locale: fromDbLocale(user.locale) } : null,
    interaction.locale,
  );
  const t = SETUP_TEXTS[locales.reply];
  const reply = async (content: string) => {
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  };
  // Not cached: the command was added without the bot itself joining the server.
  if (!interaction.inCachedGuild()) return reply(t.inviteFirst);
  const channel = interaction.options.getChannel("channel", true, [ChannelType.GuildText]);
  const me = interaction.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  const missing = REQUIRED_PERMISSIONS.filter(({ flag }) => !permissions?.has(flag));
  if (missing.length > 0) {
    const labels = missing.map(({ key }) => t.quoted(t.permissions[key])).join(", ");
    return reply(t.missingPermissions(`${channel}`, labels));
  }

  let team: { name: string };
  try {
    team = await linkTeamChannel({
      discordUserId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: channel.id,
      // A suggestion's ID or a typed name; core resolves it.
      team: interaction.options.getString("team"),
    });
  } catch (error) {
    if (isDomainError(error)) return reply(setupErrorText(error, baseUrl, locales.reply));
    throw error;
  }

  const teamName = plain(team.name);
  const post = SETUP_TEXTS[locales.post];
  try {
    await channel.send({
      embeds: [
        new EmbedBuilder().setTitle(post.testTitle).setDescription(post.testDescription(teamName)),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Could not post the /setup test message", error);
    return reply(t.testFailed(`${channel}`, teamName));
  }
  return reply(t.done(`${channel}`, teamName));
}
