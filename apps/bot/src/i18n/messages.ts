// Texts of the bot messages in both languages (ARCHITECTURE §5.22): DMs, team channel posts and
// notification mails. Team names come in already formatted (bold on Discord), never as raw text.
import { dictionary } from "@uni-scrims/core/config/locale";

const de = {
  fields: {
    start: "Start",
    format: "Format",
    opponentCaptain: "Gegnerischer Captain",
    feedbackUntil: "Feedback bis",
    reason: "Grund",
  },
  links: {
    view: "Ansehen",
    viewScrim: "Scrim ansehen",
    board: "Zum Board",
    team: "Zum Team",
    giveFeedback: "Feedback geben",
    viewStatus: "Status ansehen",
    uploadAgain: "Neu hochladen",
  },
  applicationReceived: {
    title: "Neue Bewerbung",
    description: (team: string) => `${team} hat sich auf eure Anfrage beworben.`,
  },
  applicationRejected: {
    title: "Bewerbung abgelehnt",
    description: (team: string) => `${team} hat ein anderes Team bestätigt.`,
  },
  channelBroken: {
    title: "Team-Channel getrennt",
    description: (team: string, setup: string) =>
      `Der Bot kann nicht mehr in den Team-Channel von ${team} schreiben, darum wurde die Verknüpfung entfernt. Posts für das ganze Team gibt es erst wieder mit einem neuen Channel; persönliche Benachrichtigungen kommen weiter per DM oder Mail, wie in den Einstellungen gewählt. Mit ${setup} verknüpfst du einen Channel neu.`,
  },
  feedbackPrompt: {
    title: "Wie lief euer Scrim?",
    description: (team: string) =>
      `Gebt auf der Scrim-Seite an, ob der Scrim gegen ${team} stattgefunden hat. Pro Team zählt eine Antwort.`,
  },
  reminder1h: {
    title: "Euer Scrim beginnt bald",
    description: (team: string) => `Gleich spielt ihr gegen ${team}.`,
  },
  reminder24h: {
    title: "Erinnerung an euren Scrim",
    description: (team: string) => `Euer Scrim gegen ${team} steht an.`,
  },
  requestDeleted: {
    title: "Anfrage gelöscht",
    description: (team: string) =>
      `Die Anfrage von ${team}, auf die ihr euch beworben habt, wurde gelöscht.`,
  },
  requestExpired: {
    title: "Anfrage verfallen",
    description: (team: string) =>
      `Die Anfrage von ${team} ist verfallen, ohne dass eine Bewerbung bestätigt wurde.`,
  },
  scrimBooked: {
    title: "Scrim gebucht",
    description: (team: string) =>
      `Euer Scrim gegen ${team} steht. Sprecht die Lobby mit dem gegnerischen Captain ab.`,
  },
  scrimCancelled: {
    title: "Scrim abgesagt",
    description: (team: string) => `Euer Scrim gegen ${team} wurde abgesagt.`,
  },
  verificationApproved: {
    title: "Verifizierung freigegeben",
    description: "Deine Immatrikulationsbescheinigung wurde geprüft. Du bist jetzt verifiziert.",
  },
  verificationRejected: {
    title: "Verifizierung abgelehnt",
    description:
      "Deine Immatrikulationsbescheinigung wurde abgelehnt. Du kannst eine neue hochladen.",
  },
  mail: {
    greeting: "Hallo,",
    /** `setting`: the name of the switch in the settings; `url`: the settings page. */
    footer: (setting: string, url: string) =>
      `Du bekommst diese Mail, weil „${setting}“ in deinen Einstellungen per E-Mail eingeschaltet ist. Ändern kannst du das hier: ${url}`,
  },
};

export type BotMessages = typeof de;

export const BOT_MESSAGES = dictionary(de, {
  fields: {
    start: "Start",
    format: "Format",
    opponentCaptain: "Opposing captain",
    feedbackUntil: "Feedback until",
    reason: "Reason",
  },
  links: {
    view: "View",
    viewScrim: "View scrim",
    board: "Go to the board",
    team: "Go to your team",
    giveFeedback: "Give feedback",
    viewStatus: "View status",
    uploadAgain: "Upload again",
  },
  applicationReceived: {
    title: "New application",
    description: (team) => `${team} has applied to your request.`,
  },
  applicationRejected: {
    title: "Application rejected",
    description: (team) => `${team} has accepted another team.`,
  },
  channelBroken: {
    title: "Team channel disconnected",
    description: (team, setup) =>
      `The bot can no longer post in the team channel of ${team}, so the link was removed. Posts for the whole team only come back with a new channel; personal notifications still arrive by DM or email, as chosen in the settings. Use ${setup} to link a channel again.`,
  },
  feedbackPrompt: {
    title: "How did your scrim go?",
    description: (team) =>
      `Tell us on the scrim page whether the scrim against ${team} took place. One answer per team counts.`,
  },
  reminder1h: {
    title: "Your scrim starts soon",
    description: (team) => `You're playing ${team} shortly.`,
  },
  reminder24h: {
    title: "Reminder of your scrim",
    description: (team) => `Your scrim against ${team} is coming up.`,
  },
  requestDeleted: {
    title: "Request deleted",
    description: (team) => `The request of ${team} that you applied to was deleted.`,
  },
  requestExpired: {
    title: "Request expired",
    description: (team) => `The request of ${team} expired without an application being accepted.`,
  },
  scrimBooked: {
    title: "Scrim booked",
    description: (team) =>
      `Your scrim against ${team} is set. Arrange the lobby with the opposing captain.`,
  },
  scrimCancelled: {
    title: "Scrim cancelled",
    description: (team) => `Your scrim against ${team} was cancelled.`,
  },
  verificationApproved: {
    title: "Verification approved",
    description: "Your enrolment certificate has been reviewed. You're now verified.",
  },
  verificationRejected: {
    title: "Verification rejected",
    description: "Your enrolment certificate was rejected. You can upload a new one.",
  },
  mail: {
    greeting: "Hi,",
    footer: (setting, url) =>
      `You're getting this email because “${setting}” is switched on for email in your settings. You can change that here: ${url}`,
  },
});
