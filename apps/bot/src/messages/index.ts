// Embed builder per notification type (ARCHITECTURE §6.1). Title, text and link come from core
// (notificationSummary, shared with the bell, §5.34); the bot adds the fields. Request notes and
// application messages are never part of a bot message; they only appear on the website (SPEC P0-7).
import {
  NOTIFICATION_MESSAGES,
  type NotificationMessages,
  type OutboxMessage,
  SCRIM_FORMAT_LABELS,
  describeStart,
  notificationSummary,
  rejectReasonText,
} from "@uni-scrims/core";
import type { NotifType } from "@uni-scrims/db";
import {
  type MessageBody,
  type MessageOf,
  type MessageParts,
  type ScrimMessage,
  type TextFormat,
  discordFormat,
  render,
  scrimFields,
  startField,
  summaryFormat,
} from "./common.ts";

type Fields = NonNullable<MessageParts["fields"]>;

const startOnly = (message: MessageOf<NotifType> & { payload: { startsAt: string } }) => [
  startField(message.payload.startsAt, message.locale),
];
const scrim = (message: ScrimMessage, f: TextFormat, t: NotificationMessages) =>
  scrimFields(message, f, t);

// A Record over all types, so a new type cannot be left without its fields.
const fieldBuilders: {
  [T in NotifType]: (message: MessageOf<T>, f: TextFormat, t: NotificationMessages) => Fields;
} = {
  VERIFICATION_RESULT: (message, f, t) => {
    const { approved, rejectReason } = message.payload;
    if (approved || !rejectReason) return [];
    // The fixed reasons of core are stored in German and shown in the message's language (§5.22).
    return [
      { name: t.fields.reason, value: f.text(rejectReasonText(rejectReason, message.locale)) },
    ];
  },
  APPLICATION_RECEIVED: startOnly,
  APPLICATION_REJECTED: startOnly,
  REQUEST_DELETED: startOnly,
  REQUEST_EXPIRED: startOnly,
  SCRIM_BOOKED: scrim,
  SCRIM_CANCELLED: scrim,
  REMINDER_24H: scrim,
  REMINDER_1H: scrim,
  FEEDBACK_PROMPT: (message, f, t) => {
    const fields = scrimFields(message, f, t);
    if (message.feedbackDeadline) {
      fields.push({
        name: t.fields.feedbackUntil,
        value: describeStart(message.feedbackDeadline, message.locale),
      });
    }
    return fields;
  },
  CHANNEL_BROKEN: () => [],
  DIRECT_REQUEST_RECEIVED: (message, _f, t) => [
    startField(message.payload.startsAt, message.locale),
    { name: t.fields.format, value: SCRIM_FORMAT_LABELS[message.locale][message.payload.format] },
  ],
  DIRECT_REQUEST_DECLINED: startOnly,
  PARTNERSHIP_ENDED: () => [],
  MESSAGE_RECEIVED: startOnly,
};

/**
 * The parts of a message in a format: Discord embeds and mails share their text (§5.17), in the
 * message's language (§5.22).
 */
export function messageParts(message: OutboxMessage, f: TextFormat): MessageParts {
  // The builder is picked by message.type, so it matches the message.
  const buildFields = fieldBuilders[message.type] as (
    message: OutboxMessage,
    f: TextFormat,
    t: NotificationMessages,
  ) => Fields;
  const fields = buildFields(message, f, NOTIFICATION_MESSAGES[message.locale]);
  return {
    ...notificationSummary(message.type, message.payload, message, summaryFormat(f)),
    ...(fields.length > 0 ? { fields } : {}),
  };
}

/** The Discord message body for an outbox message; links point to baseUrl (PUBLIC_BASE_URL). */
export function buildMessage(message: OutboxMessage, baseUrl: string): MessageBody {
  return render(message, messageParts(message, discordFormat), baseUrl);
}
