// The account mails (ARCHITECTURE §5.8): plain text as before, plus the HTML version of
// docs/design_handoff_emails in the account's language.
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountMailMessages } from "../i18n/mail.ts";
import { passwordResetMail, verificationMail } from "../lib/mail.ts";

const MAILS = { verification: verificationMail, passwordReset: passwordResetMail };
const URL_WITH_QUERY = "https://uniscrims.example/api/auth/verify-email?token=abc&callbackURL=%2F";

// Written out, so a change to subject or plain text fails here (the HTML version must not touch them).
const EXPECTED = {
  verification: {
    de: {
      subject: "Bitte bestätige deine E-Mail-Adresse",
      text:
        `Hallo,\n\nbitte bestätige deine E-Mail-Adresse für Uni Scrims über diesen Link:\n\n${URL_WITH_QUERY}\n\n` +
        "Der Link ist 24 Stunden gültig. Hast du dich nicht bei Uni Scrims registriert und auch keine neue " +
        "Adresse eingetragen, kannst du diese Mail ignorieren.\n\nUni Scrims",
    },
    en: {
      subject: "Please confirm your email address",
      text:
        `Hi,\n\nplease confirm your email address for Uni Scrims with this link:\n\n${URL_WITH_QUERY}\n\n` +
        "The link is valid for 24 hours. If you didn't sign up for Uni Scrims or enter a new address, you " +
        "can ignore this email.\n\nUni Scrims",
    },
  },
  passwordReset: {
    de: {
      subject: "Neues Passwort für Uni Scrims",
      text:
        `Hallo,\n\nüber diesen Link setzt du ein neues Passwort für Uni Scrims:\n\n${URL_WITH_QUERY}\n\n` +
        "Der Link ist 1 Stunde gültig. Danach bist du auf allen Geräten abgemeldet. Hast du das nicht " +
        "angefordert, ignoriere diese Mail; dein Passwort bleibt, wie es ist.\n\nUni Scrims",
    },
    en: {
      subject: "New password for Uni Scrims",
      text:
        `Hi,\n\nuse this link to set a new password for Uni Scrims:\n\n${URL_WITH_QUERY}\n\n` +
        "The link is valid for 1 hour. Afterwards you'll be signed out on all devices. If you didn't " +
        "request this, ignore this email; your password stays as it is.\n\nUni Scrims",
    },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("account mails", () => {
  for (const [kind, build] of Object.entries(MAILS) as [
    keyof typeof MAILS,
    typeof verificationMail,
  ][]) {
    for (const locale of ["de", "en"] as const) {
      it(`${kind} in ${locale}: subject and text as before, the link escaped in the HTML`, () => {
        const t = accountMailMessages[locale][kind];
        const mail = build("ana@example.org", URL_WITH_QUERY, locale);
        expect(mail.to).toBe("ana@example.org");
        expect(mail.subject).toBe(EXPECTED[kind][locale].subject);
        expect(mail.text).toBe(EXPECTED[kind][locale].text);
        const html = mail.html!;
        expect(html).toContain(`<html lang="${locale}"`);
        expect(html).toContain(`<title>${t.subject}</title>`);
        // Button, fallback link and its text.
        const escaped = URL_WITH_QUERY.replace("&", "&amp;");
        expect(html.split(escaped)).toHaveLength(4);
        expect(html).not.toContain(URL_WITH_QUERY);
        expect(html).toContain(t.button);
        expect(html).toContain(t.validity);
      });
    }
  }

  it("escapes everything it puts into the HTML", () => {
    const html = verificationMail(
      "ana@example.org",
      'https://x.example/"><script>alert(1)</script>',
      "de",
    ).html!;
    expect(html).not.toContain("<script");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("takes logo and footer links from BETTER_AUTH_URL", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://uniscrims.example");
    const html = passwordResetMail("ana@example.org", URL_WITH_QUERY, "en").html!;
    expect(html).toContain('src="https://uniscrims.example/brand/uniscrims-avatar-512.png"');
    expect(html).toContain('href="https://uniscrims.example/impressum"');
    expect(html).toContain('href="https://uniscrims.example/datenschutz"');
    expect(html).toContain('href="https://uniscrims.example/support"');
    expect(html).toContain("Legal notice");
  });
});
