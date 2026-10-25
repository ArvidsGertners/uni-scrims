// Notification mails (ARCHITECTURE §5.17): the text of the Discord message as plain German text,
// with the link written out and where to switch the mail off.
import {
  NOTIFICATION_SETTINGS_PATH,
  type OutboxMessage,
  notificationSettingLabel,
} from "@uni-scrims/core";
import type { Mail } from "@uni-scrims/core/mail";
import { MESSAGE_LOCALE, mailFormat } from "./common.ts";
import { messageParts } from "./index.ts";

/** The subject is the fixed title of the type, never user text. */
export function buildMail(message: OutboxMessage, to: string, baseUrl: string): Mail {
  const parts = messageParts(message, mailFormat);
  const lines = ["Hallo,", "", parts.description];
  if (parts.fields?.length) {
    lines.push("", ...parts.fields.map((field) => `${field.name}: ${field.value}`));
  }
  lines.push(
    "",
    `${parts.link.label}: ${new URL(parts.link.path, baseUrl).toString()}`,
    "",
    `Du bekommst diese Mail, weil „${notificationSettingLabel(message.type, MESSAGE_LOCALE)}“ in deinen Einstellungen per E-Mail eingeschaltet ist. Ändern kannst du das hier: ${new URL(NOTIFICATION_SETTINGS_PATH, baseUrl).toString()}`,
    "",
    "Uni Scrims",
  );
  return { to, subject: parts.title, text: lines.join("\n") };
}
