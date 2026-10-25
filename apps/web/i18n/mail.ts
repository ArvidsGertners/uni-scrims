// Texts of the account mails (ARCHITECTURE §5.8, §5.22): plain text, in the account's language.
// `url` stays on a line of its own, so mail clients link it.
import { dictionary } from "@uni-scrims/core/config/locale";

const de = {
  verification: {
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text: (url: string) =>
      `Hallo,\n\nbitte bestätige deine E-Mail-Adresse für Uni Scrims über diesen Link:\n\n${url}\n\n` +
      "Der Link ist 24 Stunden gültig. Hast du dich nicht bei Uni Scrims registriert und auch " +
      "keine neue Adresse eingetragen, kannst du diese Mail ignorieren.",
  },
  passwordReset: {
    subject: "Neues Passwort für Uni Scrims",
    text: (url: string) =>
      `Hallo,\n\nüber diesen Link setzt du ein neues Passwort für Uni Scrims:\n\n${url}\n\n` +
      "Der Link ist 1 Stunde gültig. Danach bist du auf allen Geräten abgemeldet. Hast du das " +
      "nicht angefordert, ignoriere diese Mail; dein Passwort bleibt, wie es ist.",
  },
};

export const accountMailMessages = dictionary(de, {
  verification: {
    subject: "Please confirm your email address",
    text: (url) =>
      `Hi,\n\nplease confirm your email address for Uni Scrims with this link:\n\n${url}\n\n` +
      "The link is valid for 24 hours. If you didn't sign up for Uni Scrims or enter a new " +
      "address, you can ignore this email.",
  },
  passwordReset: {
    subject: "New password for Uni Scrims",
    text: (url) =>
      `Hi,\n\nuse this link to set a new password for Uni Scrims:\n\n${url}\n\n` +
      "The link is valid for 1 hour. Afterwards you'll be signed out on all devices. If you " +
      "didn't request this, ignore this email; your password stays as it is.",
  },
});
