// Texts of /setup in both languages (ARCHITECTURE §5.22): the command's descriptions (German as
// Discord's default, English as localization) and the answers.
import { dictionary } from "@uni-scrims/core/config/locale";

const de = {
  command: "Verknüpft einen Channel dieses Servers mit deinem Uni-Scrims-Team",
  channelOption: "Hier landen Buchungen, Absagen, Reminder und Feedback-Hinweise",
  teamOption: "Welches Team, wenn du Captain mehrerer Teams bist",
  /** Discord's own names of the permissions. */
  permissions: {
    viewChannel: "Kanal ansehen",
    sendMessages: "Nachrichten senden",
    embedLinks: "Links einbetten",
  },
  quoted: (text: string) => `„${text}“`,
  noAccount: (registerUrl: string) =>
    `Zu deinem Discord-Konto gibt es kein Uni-Scrims-Konto. Registriere dich unter ${registerUrl} und verknüpfe dort Discord.`,
  inviteFirst: "Lade den Bot zuerst mit dem Einladungslink auf diesen Server ein.",
  missingPermissions: (channel: string, permissions: string) =>
    `Mir fehlen in ${channel} diese Rechte: ${permissions}.`,
  /** The test post in the team channel; `team` is already escaped. */
  testTitle: "Team-Channel verknüpft",
  testDescription: (team: string) =>
    `Hier landen ab jetzt Buchungen, Absagen, Reminder und Feedback-Hinweise für **${team}**.`,
  testFailed: (channel: string, team: string) =>
    `${channel} ist mit **${team}** verknüpft, aber die Test-Nachricht kam nicht an. Prüfe die Rechte des Bots im Channel.`,
  done: (channel: string, team: string) =>
    `Fertig: ${channel} ist jetzt mit **${team}** verknüpft.`,
  failed: "Etwas ist schiefgelaufen. Bitte versuch es später erneut.",
};

export const SETUP_TEXTS = dictionary(de, {
  command: "Links a channel of this server with your Uni Scrims team",
  channelOption: "Bookings, cancellations, reminders and feedback prompts land here",
  teamOption: "Which team, if you're the captain of several",
  permissions: {
    viewChannel: "View Channel",
    sendMessages: "Send Messages",
    embedLinks: "Embed Links",
  },
  quoted: (text) => `“${text}”`,
  noAccount: (registerUrl) =>
    `There's no Uni Scrims account for your Discord account. Sign up at ${registerUrl} and link Discord there.`,
  inviteFirst: "Invite the bot to this server with the invite link first.",
  missingPermissions: (channel, permissions) =>
    `I'm missing these permissions in ${channel}: ${permissions}.`,
  testTitle: "Team channel linked",
  testDescription: (team) =>
    `From now on, bookings, cancellations, reminders and feedback prompts for **${team}** land here.`,
  testFailed: (channel, team) =>
    `${channel} is linked with **${team}**, but the test message didn't arrive. Check the bot's permissions in the channel.`,
  done: (channel, team) => `Done: ${channel} is now linked with **${team}**.`,
  failed: "Something went wrong. Please try again later.",
});
