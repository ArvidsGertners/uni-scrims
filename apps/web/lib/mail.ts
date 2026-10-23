// Account mails (ARCHITECTURE §5.8): plain German text over SMTP, sent by the web only. Notifications
// stay on Discord.
import { getDevMailRedirect } from "@uni-scrims/core/config/dev";
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

/** Shown when sending fails; Better Auth passes the error on to the server action. */
export const MAIL_FAILED = "Die Mail konnte nicht gesendet werden. Bitte versuch es später erneut.";

const SIGNATURE = "\n\nUni Scrims";

export function verificationMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text:
      `Hallo,\n\nbitte bestätige deine E-Mail-Adresse für Uni Scrims über diesen Link:\n\n${url}\n\n` +
      "Der Link ist 24 Stunden gültig. Hast du dich nicht bei Uni Scrims registriert und auch " +
      "keine neue Adresse eingetragen, kannst du diese Mail ignorieren." +
      SIGNATURE,
  };
}

export function passwordResetMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Neues Passwort für Uni Scrims",
    text:
      `Hallo,\n\nüber diesen Link setzt du ein neues Passwort für Uni Scrims:\n\n${url}\n\n` +
      "Der Link ist 1 Stunde gültig. Danach bist du auf allen Geräten abgemeldet. Hast du das " +
      "nicht angefordert, ignoriere diese Mail; dein Passwort bleibt, wie es ist." +
      SIGNATURE,
  };
}

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
