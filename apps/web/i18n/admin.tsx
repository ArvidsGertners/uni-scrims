// Texts of the admin area (§5.14, §5.21), one dictionary per page. The client components of the
// area take theirs from admin-client.ts.
import { dictionary } from "@uni-scrims/core/config/locale";

/** Sidebar, tabs and warnings around every admin page. */
export const adminShellMessages = dictionary(
  {
    adminArea: "Admin-Bereich",
    areas: {
      overview: "Übersicht",
      queue: "Prüf-Queue",
      disputes: "Streitfälle",
      teamLimits: "Anträge",
      bans: "Sperren",
      notifications: "Nachrichten",
      stats: "Statistik",
      staff: "Rollen",
    },
    botRunning: "Bot läuft",
    botOffline: "Bot offline",
    /** `files`: the missing files, comma-separated. */
    missingLegal: (files: string) =>
      `Rechtstexte fehlen in LEGAL_DIR oder enthalten noch „TODO“ (${files}): Bitte vor dem Go-Live ausfüllen.`,
    /** The English versions (§5.21); without them the English pages show the German text. */
    missingEnglishLegal: (files: string) =>
      `Englische Rechtstexte fehlen in LEGAL_DIR oder enthalten noch „TODO“ (${files}): Bis dahin zeigt die englische Seite den deutschen Text.`,
  },
  {
    adminArea: "Admin area",
    areas: {
      overview: "Overview",
      queue: "Review queue",
      disputes: "Disputes",
      teamLimits: "Team requests",
      bans: "Bans",
      notifications: "Messages",
      stats: "Statistics",
      staff: "Roles",
    },
    botRunning: "Bot running",
    botOffline: "Bot offline",
    missingLegal: (files) =>
      `Legal texts are missing in LEGAL_DIR or still contain “TODO” (${files}): please fill them in before going live.`,
    missingEnglishLegal: (files) =>
      `English legal texts are missing in LEGAL_DIR or still contain “TODO” (${files}): until then the English pages show the German text.`,
  },
);

/** Start page of the admin area (SPEC N-10). */
export const adminOverviewMessages = dictionary(
  {
    title: "Übersicht",
    openReviews: "Offene Prüfungen",
    oldestWaiting: (date: string) => `Älteste wartet seit ${date}`,
    nothingToReview: "Nichts zu prüfen",
    disputes: "Streitfälle",
    disputesWaiting: "Warten auf eine Entscheidung",
    noDisputes: "Keine offenen Streitfälle",
    teamRequests: "Anträge",
    moreTeamsRequested: "Mehr Teams beantragt",
    noTeamRequests: "Keine offenen Anträge",
    messages: "Nachrichten",
    messagesFailed: "Fehlgeschlagen, nicht zugestellt",
    noneFailed: "Keine fehlgeschlagen",
    bot: "Bot",
    botRunning: "Läuft",
    botOffline: "Offline",
    /** The two loops of the bot (§6.2). */
    loops: { sweeper: "Zeitsteuerung", outbox: "Versand" },
    loopStatus: (loop: string, running: boolean, lastSeen: string) =>
      `${loop}: ${running ? "läuft" : "steht"}, ${lastSeen}`,
    lastSeen: (date: string) => `zuletzt ${date}`,
    noHeartbeat: "noch kein Lebenszeichen",
  },
  {
    title: "Overview",
    openReviews: "Open reviews",
    oldestWaiting: (date) => `Oldest waiting since ${date}`,
    nothingToReview: "Nothing to review",
    disputes: "Disputes",
    disputesWaiting: "Waiting for a decision",
    noDisputes: "No open disputes",
    teamRequests: "Team requests",
    moreTeamsRequested: "More teams requested",
    noTeamRequests: "No open requests",
    messages: "Messages",
    messagesFailed: "Failed, not delivered",
    noneFailed: "None failed",
    bot: "Bot",
    botRunning: "Running",
    botOffline: "Offline",
    loops: { sweeper: "Scheduler", outbox: "Delivery" },
    loopStatus: (loop, running, lastSeen) =>
      `${loop}: ${running ? "running" : "stopped"}, ${lastSeen}`,
    lastSeen: (date) => `last seen ${date}`,
    noHeartbeat: "no sign of life yet",
  },
);

/** Review queue of the certificates (SPEC P0-2). */
export const adminQueueMessages = dictionary(
  {
    title: "Prüf-Queue",
    empty: "Keine offenen Prüfungen.",
    /** Fixed checklist from SPEC P0-2, with the name check of N-3. */
    checklist: [
      "Bescheinigung gilt für das aktuelle Semester",
      "Name stimmt mit dem Namen des Kontos überein",
      "Hochschule stimmt mit der Auswahl überein",
      "Dokument ist vollständig und lesbar",
      "Keine offensichtliche Bearbeitung",
    ],
    noRealName: "Kein Name (Konto von vor Phase 7)",
    discordName: (name: string) => `Discord: ${name}`,
    uploaded: (date: string) => `Hochgeladen am ${date}`,
    otherUniversity: (name: string) => `Andere: ${name}`,
    megabytes: (size: string) => `${size} MB`,
    fileMissing:
      "Die Datei fehlt (z. B. nach dem Einspielen eines Backups). Bitte ablehnen, etwa mit „Bitte erneut hochladen“; freigeben geht ohne Datei nicht.",
    certificate: "Immatrikulationsbescheinigung",
    openInNewTab: "In neuem Tab öffnen",
  },
  {
    title: "Review queue",
    empty: "No open reviews.",
    checklist: [
      "Certificate is valid for the current semester",
      "Name matches the name of the account",
      "University matches the selection",
      "Document is complete and readable",
      "No obvious editing",
    ],
    noRealName: "No name (account from before Phase 7)",
    discordName: (name) => `Discord: ${name}`,
    uploaded: (date) => `Uploaded on ${date}`,
    otherUniversity: (name) => `Other: ${name}`,
    megabytes: (size) => `${size} MB`,
    fileMissing:
      "The file is missing (e.g. after restoring a backup). Please reject, for example with “Please upload again”; approving doesn't work without the file.",
    certificate: "Enrolment certificate",
    openInNewTab: "Open in new tab",
  },
);

/** Disputed scrims (SPEC Flow C 5). */
export const adminDisputesMessages = dictionary(
  {
    title: "Streitfälle",
    empty: "Keine offenen Streitfälle.",
    versus: (host: string, guest: string) => `${host} gegen ${guest}`,
    captain: (name: string) => `Captain (Discord): ${name}`,
    noAnswer: "Keine Antwort",
  },
  {
    title: "Disputes",
    empty: "No open disputes.",
    versus: (host, guest) => `${host} vs ${guest}`,
    captain: (name) => `Captain (Discord): ${name}`,
    noAnswer: "No answer",
  },
);

/** Messages the bot could not deliver (§6.2). */
export const adminNotificationsMessages = dictionary(
  {
    title: "Fehlgeschlagene Nachrichten",
    intro: (max: number) =>
      `Nachrichten, die dauerhaft nicht zugestellt werden konnten, zuletzt fehlgeschlagene zuerst (höchstens ${max}). 30 Tage nach dem letzten Versuch werden sie gelöscht.`,
    empty: "Keine fehlgeschlagenen Nachrichten.",
    hidden: (count: number) =>
      `${count} ältere fehlgeschlagene Nachrichten werden nicht angezeigt.`,
    unknownTarget: "unbekannt",
    details: (target: string, created: string, lastAttempt: string, attempts: number) =>
      `An: ${target} · erstellt ${created} · letzter Versuch ${lastAttempt} · ${attempts} Fehlversuche`,
  },
  {
    title: "Failed messages",
    intro: (max) =>
      `Messages that permanently failed to be delivered, latest failures first (at most ${max}). They are deleted 30 days after the last attempt.`,
    empty: "No failed messages.",
    hidden: (count) =>
      count === 1
        ? "1 older failed message is not shown."
        : `${count} older failed messages are not shown.`,
    unknownTarget: "unknown",
    details: (target, created, lastAttempt, attempts) =>
      `To: ${target} · created ${created} · last attempt ${lastAttempt} · ${attempts} failed ${attempts === 1 ? "attempt" : "attempts"}`,
  },
);

/** Success metrics of SPEC §8 (SPEC N-2). */
export const adminStatsMessages = dictionary(
  {
    title: "Statistik",
    intro:
      "Die Erfolgskriterien aus der Spezifikation, jeweils bis jetzt. Prüfungen gelöschter Konten fehlen, weil sie mit dem Konto gelöscht werden.",
    groups: {
      early: { title: "Frühindikatoren", hint: "für die ersten 4 Wochen" },
      late: { title: "Spätindikatoren", hint: "nach 2–3 Monaten" },
    },
    stretchReached: "Stretch erreicht",
    targetReached: "Ziel erreicht",
    targetMissed: "Ziel verfehlt",
    target: (threshold: string) => `Ziel ${threshold}`,
    stretch: (threshold: string) => `Stretch ${threshold}`,
    current: "Aktuell",
    lastDays: (days: number) => `Letzte ${days} Tage`,
    total: "Gesamt",
  },
  {
    title: "Statistics",
    intro:
      "The success criteria from the specification, each up to now. Reviews of deleted accounts are missing because they are deleted with the account.",
    groups: {
      early: { title: "Early indicators", hint: "for the first 4 weeks" },
      late: { title: "Late indicators", hint: "after 2–3 months" },
    },
    stretchReached: "Stretch reached",
    targetReached: "Target reached",
    targetMissed: "Target missed",
    target: (threshold) => `Target ${threshold}`,
    stretch: (threshold) => `Stretch ${threshold}`,
    current: "Current",
    lastDays: (days) => `Last ${days} days`,
    total: "Total",
  },
);

/** The search forms of the bans and roles pages. */
export const adminSearchMessages = dictionary(
  {
    search: "Suchen",
    reset: "Zurücksetzen",
    tooShort: (min: number) => `Bitte mindestens ${min} Zeichen eingeben.`,
  },
  {
    search: "Search",
    reset: "Reset",
    tooShort: (min) => `Please enter at least ${min} characters.`,
  },
);

// Consequences from SPEC P0-9 and the edge cases.
const TEAM_BAN_CONSEQUENCES_DE =
  "Offene Anfragen werden gelöscht, offene Bewerbungen zurückgezogen und künftige Scrims abgesagt; die Absagen zählen für niemanden als kurzfristig. Die Mitglieder bleiben im Team und können es verlassen.";
const TEAM_BAN_CONSEQUENCES_EN =
  "Open requests are deleted, open applications withdrawn and future scrims cancelled; the cancellations don't count as late for anyone. The members stay in the team and can leave it.";

/** Bans and the removal of logos and links (SPEC P0-9, N-17). */
export const adminBansMessages = dictionary(
  {
    title: "Sperren",
    banUserHint:
      "Nutzer sperren: Die Person wird sofort abgemeldet. Mitglieder werden aus ihrem Team entfernt. Ein Captain bleibt im Team, und das Team wird mitgesperrt.",
    banTeamHint: `Team sperren: ${TEAM_BAN_CONSEQUENCES_DE}`,
    unbanHint: "Entsperren geht nur per Datenbank (siehe README).",
    searchLabel: "Discord-Name, Discord-ID oder Teamname",
    users: "Nutzer",
    teams: "Teams",
    noResults: "Keine Treffer.",
    discordId: (id: string | null) => `Discord-ID ${id}`,
    banned: "Gesperrt",
    captainOf: (team: string) => `Captain von ${team}`,
    memberOf: (team: string) => `Mitglied von ${team}`,
    banUser: "Nutzer sperren",
    /** The confirmation of a user ban, in parts (SPEC N-17). */
    banUserConfirm: (name: string) => `${name} sperren? Die Person wird abgemeldet.`,
    banUserRemoved: (teams: string) => `Sie wird aus ${teams} entfernt.`,
    banUserCaptain: (count: number, teams: string) =>
      `Als Captain ${count === 1 ? "wird auch das Team" : "werden auch die Teams"} ${teams} gesperrt: ${TEAM_BAN_CONSEQUENCES_DE}`,
    captain: (name: string) => `Captain: ${name}`,
    members: (count: number) => `${count} Mitglieder`,
    banTeam: "Team sperren",
    banTeamConfirm: (team: string) => `${team} sperren? ${TEAM_BAN_CONSEQUENCES_DE}`,
    removeLogo: "Logo entfernen",
    /** On a logo tile without a logo for that background. */
    noLogo: "Keins",
    removeBothLogosConfirm: (team: string) => `Beide Logos von ${team} entfernen?`,
    removeLogoConfirm: (team: string) => `Logo von ${team} entfernen?`,
    removeLinks: "Links entfernen",
    removeLinksConfirm: (team: string) => `Alle Links von ${team} entfernen?`,
  },
  {
    title: "Bans",
    banUserHint:
      "Ban user: The person is signed out immediately. Members are removed from their team. A captain stays in the team, and the team is banned too.",
    banTeamHint: `Ban team: ${TEAM_BAN_CONSEQUENCES_EN}`,
    unbanHint: "Unbanning is only possible in the database (see README).",
    searchLabel: "Discord name, Discord ID or team name",
    users: "Users",
    teams: "Teams",
    noResults: "No results.",
    discordId: (id) => `Discord ID ${id}`,
    banned: "Banned",
    captainOf: (team) => `Captain of ${team}`,
    memberOf: (team) => `Member of ${team}`,
    banUser: "Ban user",
    banUserConfirm: (name) => `Ban ${name}? The person will be signed out.`,
    banUserRemoved: (teams) => `They will be removed from ${teams}.`,
    banUserCaptain: (count, teams) =>
      `As captain, ${count === 1 ? "the team" : "the teams"} ${teams} will be banned too: ${TEAM_BAN_CONSEQUENCES_EN}`,
    captain: (name) => `Captain: ${name}`,
    members: (count) => (count === 1 ? "1 member" : `${count} members`),
    banTeam: "Ban team",
    banTeamConfirm: (team) => `Ban ${team}? ${TEAM_BAN_CONSEQUENCES_EN}`,
    removeLogo: "Remove logo",
    noLogo: "None",
    removeBothLogosConfirm: (team) => `Remove both logos of ${team}?`,
    removeLogoConfirm: (team) => `Remove the logo of ${team}?`,
    removeLinks: "Remove links",
    removeLinksConfirm: (team) => `Remove all links of ${team}?`,
  },
);

/** Roles of the admin area, for the operator only (SPEC N-4, §5.9). */
export const adminStaffMessages = dictionary(
  {
    title: "Rollen",
    rolesHint:
      "Prüfer sehen nur die Prüf-Queue. Admins sehen den ganzen Admin-Bereich außer dieser Seite. Beide richten beim ersten Besuch eine Zwei-Faktor-Anmeldung ein und melden sich danach nur mit Passwort und Code an.",
    changesHint:
      "Jede Änderung meldet die Person überall ab. Wer die Rolle verliert, verliert auch die 2FA. Den Betreiber änderst du hier nicht (README).",
    twoFactorEnabled: "2FA eingerichtet",
    twoFactorMissing: "2FA fehlt",
    changeRole: "Rolle ändern",
    giveRole: "Rolle geben",
    changeRoleConfirm: (name: string) =>
      `Rolle von ${name} ändern? Die Person wird dabei überall abgemeldet.`,
    roleOf: (name: string) => `Rolle von ${name}`,
    noRole: "Keine Rolle",
    staffTitle: "Admins und Prüfer",
    resetTwoFactor: "2FA zurücksetzen",
    resetTwoFactorConfirm: (name: string) =>
      `2FA von ${name} zurücksetzen? Die Person richtet sie beim nächsten Besuch neu ein.`,
    addTitle: "Konto hinzufügen",
    searchLabel: "E-Mail-Adresse (genau) oder Discord-Name",
    noCandidates:
      "Keine Treffer. Gefunden werden nur vollständige, nicht gesperrte Konten mit Passwort.",
    // Flash toasts of the actions.
    roleSaved: "Rolle gespeichert",
    roleRemoved: "Rolle entzogen",
    twoFactorReset: "2FA zurückgesetzt",
  },
  {
    title: "Roles",
    rolesHint:
      "Reviewers only see the review queue. Admins see the whole admin area except this page. Both set up two-factor sign-in on their first visit and from then on sign in only with password and code.",
    changesHint:
      "Every change signs the person out everywhere. Whoever loses the role also loses the 2FA. You don't change the operator here (README).",
    twoFactorEnabled: "2FA set up",
    twoFactorMissing: "2FA missing",
    changeRole: "Change role",
    giveRole: "Give role",
    changeRoleConfirm: (name) =>
      `Change the role of ${name}? The person will be signed out everywhere.`,
    roleOf: (name) => `Role of ${name}`,
    noRole: "No role",
    staffTitle: "Admins and reviewers",
    resetTwoFactor: "Reset 2FA",
    resetTwoFactorConfirm: (name) =>
      `Reset the 2FA of ${name}? The person will set it up again on their next visit.`,
    addTitle: "Add account",
    searchLabel: "Email address (exact) or Discord name",
    noCandidates: "No results. Only complete, unbanned accounts with a password are found.",
    roleSaved: "Role saved",
    roleRemoved: "Role removed",
    twoFactorReset: "2FA reset",
  },
);

/** Requests for more teams (SPEC N-17). */
export const adminTeamLimitsMessages = dictionary(
  {
    title: "Anträge",
    intro:
      "Wer in mehr als den erlaubten Teams sein möchte, beantragt das auf der Support-Seite. Ein angenommener Antrag setzt das Team-Limit dieser Person; eine Nachricht gibt es nicht, die Person sieht den Stand auf der Support-Seite.",
    empty: "Keine offenen Anträge.",
    status: (teamCount: number, teamLimit: number, date: string) =>
      `In ${teamCount} von ${teamLimit} Teams · beantragt am ${date}`,
    quoted: (reason: string) => `„${reason}“`,
  },
  {
    title: "Team requests",
    intro:
      "Anyone who wants to be in more teams than allowed requests it on the Support page. An accepted request sets this person's team limit; there is no message, the person sees the status on the Support page.",
    empty: "No open requests.",
    status: (teamCount, teamLimit, date) =>
      `In ${teamCount} of ${teamLimit} teams · requested on ${date}`,
    quoted: (reason) => `“${reason}”`,
  },
);

/** Setup of the staff 2FA (SPEC N-4, §5.9). */
export const adminTwoFactorMessages = dictionary(
  {
    title: "Zwei-Faktor-Anmeldung einrichten",
    intro:
      "Für den Admin-Bereich brauchst du zusätzlich zum Passwort einen Code aus einer Authenticator-App. Danach meldest du dich einmal neu an, ab dann immer mit Passwort und Code. Solange du eine Rolle hast, geht die Anmeldung mit Discord nicht.",
    /** The role was removed or the 2FA reset while the code was checked. */
    resetMeanwhile: "Die Zwei-Faktor-Anmeldung wurde zurückgesetzt. Lade die Seite neu.",
    enabled: "Zwei-Faktor-Anmeldung eingerichtet. Melde dich jetzt mit Passwort und Code an",
  },
  {
    title: "Set up two-factor sign-in",
    intro:
      "For the admin area you need a code from an authenticator app in addition to your password. Afterwards you sign in again once, and from then on always with password and code. As long as you have a role, you can't sign in with Discord.",
    resetMeanwhile: "Two-factor sign-in was reset. Please reload the page.",
    enabled: "Two-factor sign-in set up. Now sign in with your password and code",
  },
);
