// Shared parts of the bot messages (ARCHITECTURE §6.1). Every message is an embed with one link
// button into the web app; nobody is pinged, and user text is escaped (SPEC P0-7).
import { type OutboxMessage, SCRIM_FORMAT_LABELS, describeStart } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type RESTPostAPIChannelMessageJSONBody,
  escapeMarkdown,
} from "discord.js";

export type MessageOf<T extends NotifType> = Extract<OutboxMessage, { type: T }>;

/** Content of one message; render turns it into the Discord message body. */
export type MessageParts = {
  title: string;
  description: string;
  fields?: { name: string; value: string }[];
  link: { label: string; path: string };
};

export type MessageBody = RESTPostAPIChannelMessageJSONBody;

const EMBED_COLOR = 0xff4655;

/** User text in bot messages: no markdown and no masked links (SPEC P0-7). */
export function plain(text: string): string {
  return escapeMarkdown(text, {
    maskedLink: true,
    heading: true,
    bulletedList: true,
    numberedList: true,
  });
}

export function startField(startsAt: string) {
  return { name: "Start", value: describeStart(new Date(startsAt)) };
}

type ScrimMessage = MessageOf<
  | typeof NotifType.SCRIM_BOOKED
  | typeof NotifType.SCRIM_CANCELLED
  | typeof NotifType.REMINDER_24H
  | typeof NotifType.REMINDER_1H
  | typeof NotifType.FEEDBACK_PROMPT
>;

/** Start, format and the opponent's current captain with name and mention (§6.1). */
export function scrimFields(message: ScrimMessage) {
  const fields = [
    startField(message.payload.startsAt),
    { name: "Format", value: SCRIM_FORMAT_LABELS[message.payload.format] },
  ];
  const captain = message.opponentCaptain;
  if (captain) {
    const name = plain(captain.name);
    fields.push({
      name: "Gegnerischer Captain",
      value: captain.discordId ? `${name} (<@${captain.discordId}>)` : name,
    });
  }
  return fields;
}

export function scrimLink(message: ScrimMessage, label = "Scrim ansehen") {
  return { label, path: `/scrims/${message.scrimId}` };
}

export const BOARD_LINK = { label: "Zum Board", path: "/board" };

export function render(message: OutboxMessage, parts: MessageParts, baseUrl: string): MessageBody {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(parts.title)
    .setDescription(parts.description);
  if (parts.fields?.length) embed.addFields(parts.fields);
  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel(parts.link.label)
    .setURL(new URL(parts.link.path, baseUrl).toString());
  const redirectedFrom = message.recipient.redirectedFrom;
  return {
    // Dev only: DMs and team posts are redirected to one account and channel (§7).
    ...(redirectedFrom ? { content: `[an: ${plain(redirectedFrom)}]` } : {}),
    embeds: [embed.toJSON()],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button).toJSON()],
    allowed_mentions: { parse: [] },
  };
}
