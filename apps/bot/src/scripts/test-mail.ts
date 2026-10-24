// Check of the notification mails (ARCHITECTURE §5.17): send one mail over the bot's SMTP settings,
// e.g. in the production bot container. Outside production it only goes to the log or to
// DEV_MAIL_REDIRECT, like every mail.
// Usage: pnpm --filter @uni-scrims/bot test-mail <address>
import "../env.ts";
import { sendMail } from "@uni-scrims/core/mail";

const to = process.argv[2];
if (!to || !/^[^@\s]+@[^@\s]+$/.test(to)) {
  console.error("Aufruf: pnpm --filter @uni-scrims/bot test-mail <adresse>");
  process.exit(1);
}

await sendMail({
  to,
  subject: "Testmail von Uni Scrims",
  text: "Hallo,\n\nwenn du das liest, kann der Bot Benachrichtigungen per Mail verschicken.\n\nUni Scrims",
});
console.log(`Mail an ${to} gesendet.`);
