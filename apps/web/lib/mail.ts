// Account mails (ARCHITECTURE §5.8): plain text and HTML in the account's language (§5.22), sent
// over the transport in core, which the bot uses for notification mails too (§5.17).
import type { Locale } from "@uni-scrims/core/config/locale";
import type { Mail } from "@uni-scrims/core/mail";
import { accountMailMessages } from "../i18n/mail.ts";
import { accountMailHtml } from "./mail-html.ts";

export { type Mail, sendMail } from "@uni-scrims/core/mail";

/**
 * The detail of the error Better Auth passes on to the server action; the form shows its own text
 * for the code MAIL_FAILED (i18n/common.ts).
 */
export const MAIL_FAILED = "The account mail could not be sent.";

const SIGNATURE = "\n\nUni Scrims";

type AccountMailTexts = (typeof accountMailMessages)["de"]["verification"];

function accountMail(to: string, url: string, locale: Locale, t: AccountMailTexts): Mail {
  return {
    to,
    subject: t.subject,
    text: t.text(url) + SIGNATURE,
    html: accountMailHtml({
      locale,
      title: t.subject,
      preheader: t.preheader,
      lead: t.lead,
      cta: t.button,
      url,
      validity: t.validity,
      ignore: t.ignore,
    }),
  };
}

export function verificationMail(to: string, url: string, locale: Locale): Mail {
  return accountMail(to, url, locale, accountMailMessages[locale].verification);
}

export function passwordResetMail(to: string, url: string, locale: Locale): Mail {
  return accountMail(to, url, locale, accountMailMessages[locale].passwordReset);
}
