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

/**
 * User text in bot messages: no markdown and no masked links (SPEC P0-7). Every bracket is escaped
 * by hand: escapeMarkdown's maskedLink option only escapes the first link of a text. "<" is escaped
 * too, so a name like <@&id> shows as text and does not render as a role or user mention.
 * escapeMarkdown escapes backslashes first, so user text cannot undo the escaping.
 */
export function plain(text: string): string {
  const escaped = escapeMarkdown(text, { heading: true, bulletedList: true, numberedList: true });
  return escaped.replace(/[[\]<]/g, "\\$&");
}

/**
 * How a message is written (§6.1, §5.17): for Discord user text is escaped, emphasis is markdown and
 * people get a mention; mails are plain text with names only.
 */
export type TextFormat = {
  /** User text such as team names. */
  text: (value: string) => string;
  /** Emphasis around already formatted text. */
  strong: (value: string) => string;
  /** A command or similar. */
  code: (value: string) => string;
  /** A person, by name and, where possible, with a mention. */
  person: (name: string, discordId: string | null) => string;
};

export const discordFormat: TextFormat = {
  text: plain,
  strong: (value) => `**${value}**`,
  code: (value) => `\`${value}\``,
  person: (name, discordId) => (discordId ? `${plain(name)} (<@${discordId}>)` : plain(name)),
};

export const mailFormat: TextFormat = {
  text: (value) => value,
  strong: (value) => value,
  code: (value) => value,
  person: (name) => name,
};

/** The other team in a message: in bold on Discord. */
export function team(name: string, f: TextFormat): string {
  return f.strong(f.text(name));
}

/** The bot writes German until Phase 23 brings the recipient's language (§5.21). */
export const MESSAGE_LOCALE = "de";

export function startField(startsAt: string) {
  return { name: "Start", value: describeStart(new Date(startsAt), MESSAGE_LOCALE) };
}

type ScrimMessage = MessageOf<
  | typeof NotifType.SCRIM_BOOKED
  | typeof NotifType.SCRIM_CANCELLED
  | typeof NotifType.REMINDER_24H
  | typeof NotifType.REMINDER_1H
  | typeof NotifType.FEEDBACK_PROMPT
>;

/** Start, format and the opponent's current captain with name and mention (§6.1). */
export function scrimFields(message: ScrimMessage, f: TextFormat) {
  const fields = [
    startField(message.payload.startsAt),
    { name: "Format", value: SCRIM_FORMAT_LABELS[MESSAGE_LOCALE][message.payload.format] },
  ];
  const captain = message.opponentCaptain;
  if (captain) {
    fields.push({ name: "Gegnerischer Captain", value: f.person(captain.name, captain.discordId) });
  }
  return fields;
}

export function scrimLink(message: ScrimMessage, label = "Scrim ansehen") {
  return { label, path: `/scrims/${message.scrimId}` };
}

export const BOARD_LINK = { label: "Zum Board", path: "/scrims" };

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
