// The mail transport shared by web and bot (ARCHITECTURE §5.8, §5.17).
import { afterEach, describe, expect, it, vi } from "vitest";

const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), options: [] as unknown[] }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: unknown) => {
      smtp.options.push(options);
      return { sendMail: smtp.sendMail };
    },
  },
}));

const { sendMail } = await import("../src/mail.ts");
const mail = { to: "ana@example.org", subject: "Betreff", text: "Hallo" };

afterEach(() => {
  vi.restoreAllMocks();
  smtp.sendMail.mockReset();
});

describe("sendMail", () => {
  it("only logs outside production without a redirect", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendMail(mail, { NODE_ENV: "development" });
    expect(info).toHaveBeenCalledWith("Mail an ana@example.org: Betreff\nHallo");
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it("sends to the redirect in development, with the real recipient in the subject", async () => {
    await sendMail(mail, {
      NODE_ENV: "development",
      DEV_MAIL_REDIRECT: "dev@example.org",
      MAIL_FROM: "Uni Scrims <noreply@example.org>",
    });
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: "Uni Scrims <noreply@example.org>",
      to: "dev@example.org",
      subject: "[an: ana@example.org] Betreff",
      text: "Hallo",
    });
  });

  it("sends as is in production, with timeouts on the connection", async () => {
    await sendMail(mail, { NODE_ENV: "production", MAIL_FROM: "noreply@example.org" });
    expect(smtp.sendMail).toHaveBeenCalledWith({ from: "noreply@example.org", ...mail });
    expect(smtp.options[0]).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });
});
