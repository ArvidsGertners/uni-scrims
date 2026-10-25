// Account mails (ARCHITECTURE §5.8): plain text in the account's language (§5.22), sent over the
// transport in core, which the bot uses for notification mails too (§5.17).
import type { Locale } from "@uni-scrims/core/config/locale";
import type { Mail } from "@uni-scrims/core/mail";
import { accountMailMessages } from "../i18n/mail.ts";

export { type Mail, sendMail } from "@uni-scrims/core/mail";

/**
 * The detail of the error Better Auth passes on to the server action; the form shows its own text
 * for the code MAIL_FAILED (i18n/common.ts).
 */
export const MAIL_FAILED = "The account mail could not be sent.";

const SIGNATURE = "\n\nUni Scrims";

export function verificationMail(to: string, url: string, locale: Locale): Mail {
  const t = accountMailMessages[locale].verification;
  return { to, subject: t.subject, text: t.text(url) + SIGNATURE };
}

export function passwordResetMail(to: string, url: string, locale: Locale): Mail {
  const t = accountMailMessages[locale].passwordReset;
  return { to, subject: t.subject, text: t.text(url) + SIGNATURE };
}
