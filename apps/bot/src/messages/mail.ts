// Notification mails (ARCHITECTURE §5.17): the text of the Discord message as plain text in the
// recipient's language (§5.22), with the link written out and where to switch the mail off.
import {
  NOTIFICATION_MESSAGES,
  NOTIFICATION_SETTINGS_PATH,
  type OutboxMessage,
  notificationSettingLabel,
} from "@uni-scrims/core";
import type { Mail } from "@uni-scrims/core/mail";
import { linkUrl, mailFormat } from "./common.ts";
import { messageParts } from "./index.ts";

/** The subject is the fixed title of the type, never user text. */
export function buildMail(message: OutboxMessage, to: string, baseUrl: string): Mail {
  const parts = messageParts(message, mailFormat);
  const t = NOTIFICATION_MESSAGES[message.locale].mail;
  const setting = notificationSettingLabel(message.type, message.locale);
  const settingsUrl = new URL(NOTIFICATION_SETTINGS_PATH, baseUrl).toString();
  const lines = [t.greeting, "", parts.description];
  if (parts.fields?.length) {
    lines.push("", ...parts.fields.map((field) => `${field.name}: ${field.value}`));
  }
  lines.push(
    "",
    `${parts.link.label}: ${linkUrl(parts.link, baseUrl)}`,
    "",
    t.footer(setting, settingsUrl),
    "",
    "Uni Scrims",
  );
  return { to, subject: parts.title, text: lines.join("\n") };
}
