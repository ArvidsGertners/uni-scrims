// /setup (ARCHITECTURE §6.4): links the server and a text channel with the caller's team. Besides the
// link buttons this is the bot's only interaction (SPEC P0-7). Who may do it is decided in core.
import { type DomainError, isDomainError, linkTeamChannel } from "@uni-scrims/core";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { plain } from "../messages/common.ts";

export const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Verknüpft einen Channel dieses Servers mit deinem Uni-Scrims-Team")
  .setContexts(InteractionContextType.Guild)
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("Hier landen Buchungen, Absagen, Reminder und Feedback-Hinweise")
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true),
  );

/** What the bot needs in the channel to post embeds. */
const REQUIRED_PERMISSIONS = [
  { flag: PermissionFlagsBits.ViewChannel, label: "Kanal ansehen" },
  { flag: PermissionFlagsBits.SendMessages, label: "Nachrichten senden" },
  { flag: PermissionFlagsBits.EmbedLinks, label: "Links einbetten" },
];

/** The answer to a refused /setup; core's texts, except for users without an account. */
export function setupErrorText(error: DomainError, baseUrl: string): string {
  if (error.code === "UNAUTHENTICATED") {
    return `Du hast noch kein Uni-Scrims-Konto. Melde dich zuerst unter ${baseUrl} mit Discord an.`;
  }
  return error.message;
}

export async function handleSetup(
  interaction: ChatInputCommandInteraction,
  baseUrl: string,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reply = async (content: string) => {
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  };
  // Not cached: the command was added without the bot itself joining the server.
  if (!interaction.inCachedGuild()) {
    return reply("Lade den Bot zuerst mit dem Einladungslink auf diesen Server ein.");
  }
  const channel = interaction.options.getChannel("channel", true, [ChannelType.GuildText]);
  const me = interaction.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  const missing = REQUIRED_PERMISSIONS.filter(({ flag }) => !permissions?.has(flag));
  if (missing.length > 0) {
    const labels = missing.map(({ label }) => `„${label}“`).join(", ");
    return reply(`Mir fehlen in ${channel} diese Rechte: ${labels}.`);
  }

  let team: { name: string };
  try {
    team = await linkTeamChannel({
      discordUserId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: channel.id,
    });
  } catch (error) {
    if (isDomainError(error)) return reply(setupErrorText(error, baseUrl));
    throw error;
  }

  const teamName = plain(team.name);
  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Team-Channel verknüpft")
          .setDescription(
            `Hier landen ab jetzt Buchungen, Absagen, Reminder und Feedback-Hinweise für **${teamName}**.`,
          ),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("Could not post the /setup test message", error);
    return reply(
      `${channel} ist mit **${teamName}** verknüpft, aber die Test-Nachricht kam nicht an. Prüfe die Rechte des Bots im Channel.`,
    );
  }
  return reply(`Fertig: ${channel} ist jetzt mit **${teamName}** verknüpft.`);
}
