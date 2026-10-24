// Mail transport (ARCHITECTURE §5.8, §5.17): plain German text over SMTP, for the account mails of
// the web and, from Phase 18, the notification mails of the bot. A subpath export of its own
// (@uni-scrims/core/mail), so no client bundle that imports core pulls in nodemailer.
import nodemailer, { type Transporter } from "nodemailer";
import { getDevMailRedirect } from "../config/dev.ts";

export type Mail = { to: string; subject: string; text: string };

let transporter: Transporter | null = null;

function smtpTransport(env: NodeJS.ProcessEnv): Transporter {
  if (!transporter) {
    const port = Number(env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      // 465 speaks TLS from the start, 587 upgrades with STARTTLS, which must not be skipped.
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      // nodemailer waits minutes by default; a hanging server must not hold up the bot's
      // sequential outbox loop (§6.2) or a web request for long.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

/**
 * Sends a mail. Outside production it only goes to the log, or with DEV_MAIL_REDIRECT to that
 * address, prefixed with the real recipient (like DEV_DM_REDIRECT_DISCORD_ID). Throws on failure.
 */
export async function sendMail(mail: Mail, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  let message = mail;
  if (env.NODE_ENV !== "production") {
    const redirect = getDevMailRedirect(env);
    if (!redirect) {
      console.info(`Mail an ${mail.to}: ${mail.subject}\n${mail.text}`);
      return;
    }
    message = { ...mail, to: redirect, subject: `[an: ${mail.to}] ${mail.subject}` };
  }
  await smtpTransport(env).sendMail({ from: env.MAIL_FROM, ...message });
}
