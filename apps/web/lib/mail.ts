// Account mails (ARCHITECTURE §5.8): plain German text, sent over the transport in core, which the
// bot uses for notification mails too (§5.17).
import type { Mail } from "@uni-scrims/core/mail";

export { type Mail, sendMail } from "@uni-scrims/core/mail";

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
