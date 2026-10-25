// Texts of the account mails (ARCHITECTURE §5.8, §5.22) in the account's language: the plain text,
// where `url` stays on a line of its own, so mail clients link it, and the parts of the HTML version
// (docs/design_handoff_emails), whose heading is the subject.
import { dictionary } from "@uni-scrims/core/config/locale";

const de = {
  verification: {
    subject: "Bitte bestätige deine E-Mail-Adresse",
    text: (url: string) =>
      `Hallo,\n\nbitte bestätige deine E-Mail-Adresse für Uni Scrims über diesen Link:\n\n${url}\n\n` +
      "Der Link ist 24 Stunden gültig. Hast du dich nicht bei Uni Scrims registriert und auch " +
      "keine neue Adresse eingetragen, kannst du diese Mail ignorieren.",
    preheader:
      "Ein Klick, dann ist deine Adresse für Uni Scrims bestätigt. Der Link ist 24 Stunden gültig.",
    lead: "bitte bestätige deine E-Mail-Adresse für Uni Scrims über diesen Link.",
    button: "E-Mail-Adresse bestätigen",
    validity: "Link 24 Stunden gültig",
    ignore:
      "Hast du dich nicht bei Uni Scrims registriert und auch keine neue Adresse eingetragen, " +
      "kannst du diese Mail ignorieren.",
  },
  passwordReset: {
    subject: "Neues Passwort für Uni Scrims",
    text: (url: string) =>
      `Hallo,\n\nüber diesen Link setzt du ein neues Passwort für Uni Scrims:\n\n${url}\n\n` +
      "Der Link ist 1 Stunde gültig. Danach bist du auf allen Geräten abgemeldet. Hast du das " +
      "nicht angefordert, ignoriere diese Mail; dein Passwort bleibt, wie es ist.",
    preheader: "Über diesen Link setzt du ein neues Passwort. Der Link ist 1 Stunde gültig.",
    lead:
      "über diesen Link setzt du ein neues Passwort für Uni Scrims. Danach bist du auf allen " +
      "Geräten abgemeldet.",
    button: "Neues Passwort setzen",
    validity: "Link 1 Stunde gültig",
    ignore:
      "Hast du das nicht angefordert, ignoriere diese Mail; dein Passwort bleibt, wie es ist.",
  },
  /** The same in both mails. */
  html: {
    hello: "Hallo,",
    fallback: "Der Button geht nicht? Kopier diesen Link in deinen Browser:",
    tagline: "Uni Scrims · Valorant-Scrims für Hochschulteams",
    impressum: "Impressum",
    privacy: "Datenschutz",
    support: "Support",
  },
};

export const accountMailMessages = dictionary(de, {
  verification: {
    subject: "Please confirm your email address",
    text: (url) =>
      `Hi,\n\nplease confirm your email address for Uni Scrims with this link:\n\n${url}\n\n` +
      "The link is valid for 24 hours. If you didn't sign up for Uni Scrims or enter a new " +
      "address, you can ignore this email.",
    preheader:
      "One click and your address for Uni Scrims is confirmed. The link is valid for 24 hours.",
    lead: "please confirm your email address for Uni Scrims with this link.",
    button: "Confirm email address",
    validity: "Link valid for 24 hours",
    ignore:
      "If you didn't sign up for Uni Scrims or enter a new address, you can ignore this email.",
  },
  passwordReset: {
    subject: "New password for Uni Scrims",
    text: (url) =>
      `Hi,\n\nuse this link to set a new password for Uni Scrims:\n\n${url}\n\n` +
      "The link is valid for 1 hour. Afterwards you'll be signed out on all devices. If you " +
      "didn't request this, ignore this email; your password stays as it is.",
    preheader: "Use this link to set a new password. The link is valid for 1 hour.",
    lead:
      "use this link to set a new password for Uni Scrims. Afterwards you'll be signed out on " +
      "all devices.",
    button: "Set new password",
    validity: "Link valid for 1 hour",
    ignore: "If you didn't request this, ignore this email; your password stays as it is.",
  },
  html: {
    hello: "Hi,",
    fallback: "Button not working? Copy this link into your browser:",
    tagline: "Uni Scrims · Valorant scrims for university teams",
    impressum: "Legal notice",
    privacy: "Privacy",
    support: "Support",
  },
});
