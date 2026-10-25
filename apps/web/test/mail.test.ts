// The account mails (ARCHITECTURE §5.8): plain text as before, plus the HTML version of
// docs/design_handoff_emails in the account's language.
import { afterEach, describe, expect, it, vi } from "vitest";
import { accountMailMessages } from "../i18n/mail.ts";
import { passwordResetMail, verificationMail } from "../lib/mail.ts";

const MAILS = { verification: verificationMail, passwordReset: passwordResetMail };
const URL_WITH_QUERY = "https://uniscrims.example/api/auth/verify-email?token=abc&callbackURL=%2F";

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
        expect(mail.subject).toBe(t.subject);
        expect(mail.text).toBe(`${t.text(URL_WITH_QUERY)}\n\nUni Scrims`);
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
