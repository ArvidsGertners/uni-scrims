// Embed builder per notification type (ARCHITECTURE §6.1). Request notes and application messages
// are never part of a bot message; they only appear on the website (SPEC P0-7).
import type { OutboxMessage } from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import { BOT_MESSAGES, type BotMessages } from "../i18n/messages.ts";
import { applicationReceived } from "./application-received.ts";
import { applicationRejected } from "./application-rejected.ts";
import { channelBroken } from "./channel-broken.ts";
import {
  type MessageBody,
  type MessageOf,
  type MessageParts,
  type TextFormat,
  discordFormat,
  render,
} from "./common.ts";
import { feedbackPrompt } from "./feedback-prompt.ts";
import { reminder1h } from "./reminder-1h.ts";
import { reminder24h } from "./reminder-24h.ts";
import { requestDeleted } from "./request-deleted.ts";
import { requestExpired } from "./request-expired.ts";
import { scrimBooked } from "./scrim-booked.ts";
import { scrimCancelled } from "./scrim-cancelled.ts";
import { verificationResult } from "./verification-result.ts";

// A Record over all types, so a new type cannot be left without a message.
const builders: {
  [T in NotifType]: (message: MessageOf<T>, f: TextFormat, t: BotMessages) => MessageParts;
} = {
  VERIFICATION_RESULT: verificationResult,
  APPLICATION_RECEIVED: applicationReceived,
  APPLICATION_REJECTED: applicationRejected,
  REQUEST_DELETED: requestDeleted,
  REQUEST_EXPIRED: requestExpired,
  SCRIM_BOOKED: scrimBooked,
  SCRIM_CANCELLED: scrimCancelled,
  REMINDER_24H: reminder24h,
  REMINDER_1H: reminder1h,
  FEEDBACK_PROMPT: feedbackPrompt,
  CHANNEL_BROKEN: channelBroken,
};

/**
 * The parts of a message in a format: Discord embeds and mails share their text (§5.17), in the
 * message's language (§5.22).
 */
export function messageParts(message: OutboxMessage, f: TextFormat): MessageParts {
  // The builder is picked by message.type, so it matches the message.
  const build = builders[message.type] as (
    message: OutboxMessage,
    f: TextFormat,
    t: BotMessages,
  ) => MessageParts;
  return build(message, f, BOT_MESSAGES[message.locale]);
}

/** The Discord message body for an outbox message; links point to baseUrl (PUBLIC_BASE_URL). */
export function buildMessage(message: OutboxMessage, baseUrl: string): MessageBody {
  return render(message, messageParts(message, discordFormat), baseUrl);
}
