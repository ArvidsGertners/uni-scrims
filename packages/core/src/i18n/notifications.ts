// Texts of the notifications in both languages (ARCHITECTURE §5.22, §5.34): DMs, team channel
// posts, notification mails and, since Phase 36, the bell on the site. Team names come in already
// formatted (bold on Discord), never as raw text.
import { dictionary } from "../../config/locale.ts";

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
    requests: "Zu euren Anfragen",
    readMessage: "Nachricht lesen",
    // Phase 37 (§5.35): into the admin area.
    queue: "Zur Prüf-Queue",
    reports: "Zu den Meldungen",
    teamLimits: "Zu den Anträgen",
    disputes: "Zu den Streitfällen",
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
    // A direct request to the team, withdrawn by the requesting team (SPEC N-26).
    directTitle: "Direktanfrage zurückgezogen",
    directDescription: (team: string) => `${team} hat die Direktanfrage an euch zurückgezogen.`,
  },
  directRequestReceived: {
    title: "Neue Direktanfrage",
    description: (team: string) =>
      `${team} fragt euch direkt für ein Scrim an. Nehmt die Anfrage auf der Seite an oder lehnt sie ab.`,
    /** `until`: the date of the last scrim of the proposed partnership. */
    weeklyDescription: (team: string, until: string) =>
      `${team} schlägt euch eine feste Partnerschaft vor: jede Woche zur selben Zeit bis ${until}. Nehmt ihr an, wird jeder Termin von selbst gebucht.`,
    // For a start time in the team's window "Heute spielbereit" (SPEC N-27).
    readyWindowDescription: (team: string) =>
      `${team} fragt euch für euer Zeitfenster „Heute spielbereit“ an. Nehmt die Anfrage auf der Seite an oder lehnt sie ab; mit einer Zusage endet euer Zeitfenster.`,
  },
  directRequestDeclined: {
    title: "Direktanfrage abgelehnt",
    description: (team: string) => `${team} hat eure Direktanfrage abgelehnt.`,
    // The other requests of a window "Heute spielbereit" (SPEC N-27): the team accepted another
    // one or ended the window.
    readyWindowBooked: (team: string) =>
      `${team} hat für heute schon einen Gegner. Eure Anfrage für ihr Zeitfenster ist damit abgelehnt.`,
    readyWindowEnded: (team: string) =>
      `${team} ist heute doch nicht mehr spielbereit. Eure Anfrage für ihr Zeitfenster ist damit abgelehnt.`,
  },
  // Never the text of the message (SPEC N-28): who wrote and about what, from the receiving side.
  messageReceived: {
    title: "Neue Nachricht",
    applicationToHost: (team: string) =>
      `${team} hat euch zu seiner Bewerbung auf eure Anfrage geschrieben.`,
    applicationToGuest: (team: string) => `${team} hat euch zu eurer Bewerbung geschrieben.`,
    directToHost: (team: string) => `${team} hat euch zu eurer Direktanfrage geschrieben.`,
    directToGuest: (team: string) =>
      `${team} hat euch zu seiner Direktanfrage an euch geschrieben.`,
    scrim: (team: string) => `${team} hat euch zu eurem Scrim geschrieben.`,
    onlyOnSite: "Die Nachricht selbst steht nur auf der Seite.",
  },
  partnershipEnded: {
    title: "Feste Partnerschaft beendet",
    /** `weekday`: the day of the partnership's scrims. */
    description: (team: string, weekday: string) =>
      `${team} hat die feste Partnerschaft (jeden ${weekday}) beendet. Weitere Termine werden nicht mehr gebucht; schon gebuchte Scrims bleiben bestehen.`,
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
  // Phase 37 (SPEC N-33): for staff, without names of people or message texts.
  staffVerificationPending: {
    title: "Neue Verifizierung",
    description: "Eine Immatrikulationsbescheinigung wartet in der Prüf-Queue auf ihre Prüfung.",
  },
  staffMessageReported: {
    title: "Nachricht gemeldet",
    description: "Ein Team hat eine Nachricht gemeldet. Entferne sie oder verwirf die Meldung.",
  },
  staffTeamLimitRequest: {
    title: "Antrag auf mehr Teams",
    description: "Jemand möchte mehr Teams haben. Der Antrag wartet auf eine Entscheidung.",
  },
  staffDispute: {
    title: "Strittiges Scrim",
    /** `date`: the day of the scrim. */
    description: (host: string, guest: string, date: string) =>
      `Die Feedbacks von ${host} und ${guest} zum Scrim am ${date} widersprechen sich. Der Streitfall wartet auf eine Entscheidung.`,
  },
  mail: {
    greeting: "Hallo,",
    /** `setting`: the name of the switch in the settings; `url`: the settings page. */
    footer: (setting: string, url: string) =>
      `Du bekommst diese Mail, weil „${setting}“ in deinen Einstellungen per E-Mail eingeschaltet ist. Ändern kannst du das hier: ${url}`,
  },
};

export type NotificationMessages = typeof de;

export const NOTIFICATION_MESSAGES = dictionary(de, {
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
    requests: "Go to your requests",
    readMessage: "Read message",
    queue: "Go to the review queue",
    reports: "Go to the reports",
    teamLimits: "Go to the team requests",
    disputes: "Go to the disputes",
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
    directTitle: "Direct request withdrawn",
    directDescription: (team) => `${team} withdrew their direct request to you.`,
  },
  directRequestReceived: {
    title: "New direct request",
    description: (team) =>
      `${team} is asking you directly for a scrim. Accept or decline the request on the site.`,
    weeklyDescription: (team, until) =>
      `${team} proposes a fixed partnership: every week at the same time until ${until}. If you accept, every date is booked automatically.`,
    readyWindowDescription: (team) =>
      `${team} is asking you for your “Ready today” window. Accept or decline the request on the site; accepting one ends your window.`,
  },
  directRequestDeclined: {
    title: "Direct request declined",
    description: (team) => `${team} declined your direct request.`,
    readyWindowBooked: (team) =>
      `${team} already has an opponent for today, so your request for their window is declined.`,
    readyWindowEnded: (team) =>
      `${team} is no longer ready to play today, so your request for their window is declined.`,
  },
  messageReceived: {
    title: "New message",
    applicationToHost: (team) =>
      `${team} sent you a message about its application to your request.`,
    applicationToGuest: (team) => `${team} sent you a message about your application.`,
    directToHost: (team) => `${team} sent you a message about your direct request.`,
    directToGuest: (team) => `${team} sent you a message about its direct request to you.`,
    scrim: (team) => `${team} sent you a message about your scrim.`,
    onlyOnSite: "The message itself is only on the site.",
  },
  partnershipEnded: {
    title: "Fixed partnership ended",
    description: (team, weekday) =>
      `${team} ended the fixed partnership (every ${weekday}). No more dates will be booked; scrims already booked stay.`,
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
  staffVerificationPending: {
    title: "New verification",
    description: "An enrolment certificate is waiting for review in the review queue.",
  },
  staffMessageReported: {
    title: "Message reported",
    description: "A team reported a message. Remove it or dismiss the report.",
  },
  staffTeamLimitRequest: {
    title: "Request for more teams",
    description: "Someone would like more teams. The request is waiting for a decision.",
  },
  staffDispute: {
    title: "Disputed scrim",
    description: (host, guest, date) =>
      `${host} and ${guest} gave contradicting feedback on their scrim on ${date}. The dispute is waiting for a decision.`,
  },
  mail: {
    greeting: "Hi,",
    footer: (setting, url) =>
      `You're getting this email because “${setting}” is switched on for email in your settings. You can change that here: ${url}`,
  },
});
