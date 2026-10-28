// Texts of the settings, the notifications, the account setup and the verification (§5.21).
import { dictionary } from "@uni-scrims/core/config/locale";
import type { ReactNode } from "react";

/** Renders the linked part of a sentence; the page keeps the markup. */
type LinkPart = (label: string) => ReactNode;

/** The tabs of the settings (SPEC N-11, N-13, N-14). */
export const accountTabsMessages = dictionary(
  {
    label: "Einstellungen",
    general: "Allgemein",
    notifications: "Benachrichtigungen",
    verification: "Verifizierung",
  },
  {
    label: "Settings",
    general: "General",
    notifications: "Notifications",
    verification: "Verification",
  },
);

export const accountPageMessages = dictionary(
  {
    title: "Einstellungen",
    bannedNotice: "Dein Konto ist gesperrt. Löschen kannst du es trotzdem.",
    setupIncomplete: (link: LinkPart) => (
      <>Dein Konto ist noch nicht fertig eingerichtet. {link("Weiter")}</>
    ),
    discordLinkFailed:
      "Das Discord-Konto ließ sich nicht verbinden. Verbinde das Discord-Konto, das schon mit Uni Scrims verknüpft ist.",
    linkInvalid: "Der Link ist ungültig oder abgelaufen. Bitte versuch es erneut.",
    emailConfirmed: "Deine E-Mail-Adresse ist bestätigt.",
    basics: "Grundeinstellungen",
    profileId: "Profil-ID",
    profileIdHint: "Nenn sie uns, wenn du dich beim Support meldest. Ändern lässt sie sich nicht.",
    theme: "Design",
    themeHint: "„System“ folgt der Einstellung deines Geräts. Deine Wahl gilt auf allen Geräten.",
    saveRank: "Rang speichern",
    yourRank: "Dein Rang",
    noRank: "Kein Rang",
    rankHint:
      "Selbst angegeben. Als Spieler oder Ersatzspieler zählt er für euren Team-Rang. Deine Teams sehen ihn, und in der Teams-Liste alle Eingeloggten bei jedem deiner Teams, das dort steht.",
    /** The state of the verification and the button to /verify (SPEC N-9). */
    verification: {
      VERIFIED: { label: "Verifiziert", action: "Details" },
      PENDING: { label: "In Prüfung", action: "Status ansehen" },
      REJECTED: { label: "Abgelehnt", action: "Bescheinigung hochladen" },
      NONE: { label: "Nicht verifiziert", action: "Bescheinigung hochladen" },
    },
    status: "Status",
    university: "Hochschule",
    teams: (count: number) => (count > 1 ? "Teams" : "Team"),
    /** After the name of a team the user captains. */
    captainSuffix: " · Captain",
    noTeam: "Kein Team",
    studentStatus: "Studierendenstatus",
    linkedAccounts: "Verknüpfte Konten",
    discord: "Discord",
    linkedWithDiscord: "Mit Discord verknüpft",
    relinkDiscord: "Discord erneut verbinden",
    discordMessagesArrive: "Discord-Nachrichten kommen an",
    discordNotLinked: (link: LinkPart) => (
      <>Noch nicht verknüpft. Das geht im {link("nächsten Schritt der Einrichtung")}.</>
    ),
    oplIntro:
      "Verknüpfe dein Profil bei OPL (opleague.pro). Das geht nur, wenn dort dasselbe Discord-Konto hinterlegt ist wie hier.",
    oplProfileLink: "Link zu deinem OPL-Profil",
    oplLink: "Verknüpfen",
    oplHint:
      "Discord verknüpfst du auf OPL in deinem Profil. Wir speichern nur die ID deines OPL-Profils und prüfen etwa einmal am Tag, ob die Verknüpfung noch passt.",
    oplLinked: "Mit OPL verknüpft",
    oplProfile: "Dein Profil auf OPL",
    oplLinkedAt: (date: string) => `Verknüpft am ${date}`,
    oplCheckedAt: (date: string) => `Zuletzt geprüft am ${date}`,
    oplUnlink: "Verknüpfung lösen",
    oplUnlinkConfirm: "OPL-Verknüpfung lösen? Ist dein Team mit OPL verknüpft, bleibt das so.",
    nameAndSignIn: "Name und Anmeldung",
    saveName: "Name speichern",
    nameHint:
      "Wie auf deiner Immatrikulationsbescheinigung. Nach dem Hochladen kannst du ihn nicht mehr selbst ändern. Nur du und unsere Prüfer sehen ihn.",
    nameLockedHint:
      "Nur du und unsere Prüfer sehen deinen Namen. Ändern geht nach dem Hochladen der Bescheinigung nur per Mail an uns (Adresse im Impressum).",
    /** Before the current address. */
    emailAddress: "E-Mail-Adresse:",
    changeEmail: "Adresse ändern",
    newEmail: "Neue E-Mail-Adresse",
    newEmailHint: "Wir schicken einen Link an die neue Adresse. Bis du ihn öffnest, gilt die alte.",
    changePassword: "Passwort ändern",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    passwordHint: "Auf deinen anderen Geräten wirst du danach abgemeldet.",
    yourData: "Deine Daten",
    yourDataText: (link: LinkPart) => (
      <>
        Lade alles herunter, was wir zu deinem Konto speichern, als JSON-Datei (Auskunft nach Art.
        15 DSGVO). Wozu wir die Daten nutzen und wie lange wir sie aufbewahren, steht in der{" "}
        {link("Datenschutzerklärung")}.
      </>
    ),
    downloadData: "Meine Daten herunterladen",
    deleteAccount: "Konto löschen",
    deleteAccountText:
      "Löscht dein Konto mit deinen persönlichen Daten und deiner Verifizierung. Das lässt sich nicht rückgängig machen.",
    /** After the problem: the teams that block the deletion. */
    affectedTeams: (names: string) => `Betrifft: ${names}.`,
    toTeam: (name: string) => `Zu ${name}`,
    handOverCaptain: "Captain-Rolle übertragen",
    handOverConfirm: (team: string) => `Captain-Rolle in ${team} wirklich übertragen?`,
    newCaptainFor: (team: string) => `Neuer Captain für ${team}`,
    chooseNewCaptain: "Neuen Captain wählen …",
    /** What the deletion does, in the confirmation dialog (SPEC P0-10). */
    consequences: {
      deleted:
        "Gelöscht werden dein Name, deine E-Mail-Adresse, dein Passwort und dein Avatar, deine Verifizierung samt Prüfungen und Dateien, Nachrichten an dich, deine Nachrichten an andere Teams und deine Anmeldungen.",
      discordIdKept:
        "Deine Discord-ID bleibt mit der Sperre gespeichert, damit sie bei einer neuen Anmeldung weiter gilt.",
      discordUnlinked: "Die Verknüpfung mit deinem Discord-Konto wird gelöscht.",
      teamDissolved: (team: string) => `Dein Team ${team} wird aufgelöst.`,
      teamLeft: (team: string) => `Du verlässt dein Team ${team}.`,
      pastScrims: "Vergangene Scrims bleiben anonymisiert für die Team-Statistik.",
      hubServer:
        "Vom Uni-Scrims-Discord-Server wirst du nicht entfernt. Den kannst du selbst verlassen.",
    },
  },
  {
    title: "Settings",
    bannedNotice: "Your account is banned. You can still delete it.",
    setupIncomplete: (link: LinkPart) => (
      <>
        {"Your account isn't fully set up yet."} {link("Continue")}
      </>
    ),
    discordLinkFailed:
      "The Discord account couldn't be connected. Connect the Discord account that's already linked with Uni Scrims.",
    linkInvalid: "The link is invalid or has expired. Please try again.",
    emailConfirmed: "Your email address is confirmed.",
    basics: "Basic settings",
    profileId: "Profile ID",
    profileIdHint: "Tell us this when you contact support. It can't be changed.",
    theme: "Theme",
    themeHint: "“System” follows the setting of your device. Your choice applies on all devices.",
    saveRank: "Save rank",
    yourRank: "Your rank",
    noRank: "No rank",
    rankHint:
      "Self-reported. As a player or substitute, it counts towards your team rank. Your teams see it, and so does everyone signed in on the teams list, with each of your teams that is listed there.",
    verification: {
      VERIFIED: { label: "Verified", action: "Details" },
      PENDING: { label: "Under review", action: "View status" },
      REJECTED: { label: "Rejected", action: "Upload certificate" },
      NONE: { label: "Not verified", action: "Upload certificate" },
    },
    status: "Status",
    university: "University",
    teams: (count: number) => (count > 1 ? "Teams" : "Team"),
    captainSuffix: " · Captain",
    noTeam: "No team",
    studentStatus: "Student status",
    linkedAccounts: "Linked accounts",
    discord: "Discord",
    linkedWithDiscord: "Linked with Discord",
    relinkDiscord: "Reconnect Discord",
    discordMessagesArrive: "Discord messages are getting through",
    discordNotLinked: (link: LinkPart) => (
      <>Not linked yet. You can do that in the {link("next step of the setup")}.</>
    ),
    oplIntro:
      "Link your profile on OPL (opleague.pro). This only works if it has the same Discord account as here.",
    oplProfileLink: "Link to your OPL profile",
    oplLink: "Link",
    oplHint:
      "You link Discord on OPL in your profile. We only store the ID of your OPL profile and check about once a day that the link still fits.",
    oplLinked: "Linked with OPL",
    oplProfile: "Your profile on OPL",
    oplLinkedAt: (date: string) => `Linked on ${date}`,
    oplCheckedAt: (date: string) => `Last checked on ${date}`,
    oplUnlink: "Unlink",
    oplUnlinkConfirm: "Unlink OPL? If your team is linked with OPL, it stays that way.",
    nameAndSignIn: "Name and sign-in",
    saveName: "Save name",
    nameHint:
      "As on your enrolment certificate. Once you've uploaded it, you can no longer change your name yourself. Only you and our reviewers see it.",
    nameLockedHint:
      "Only you and our reviewers see your name. After uploading the certificate, you can only change it by emailing us (address in the legal notice).",
    emailAddress: "Email address:",
    changeEmail: "Change address",
    newEmail: "New email address",
    newEmailHint:
      "We'll send a link to the new address. Until you open it, the old one stays valid.",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    passwordHint: "You'll then be signed out on your other devices.",
    yourData: "Your data",
    yourDataText: (link: LinkPart) => (
      <>
        Download everything we store about your account as a JSON file (access under Art. 15 GDPR);
        the file uses German field names. What we use the data for and how long we keep it is
        explained in the {link("privacy policy")}.
      </>
    ),
    downloadData: "Download my data",
    deleteAccount: "Delete account",
    deleteAccountText:
      "Deletes your account with your personal data and your verification. This can't be undone.",
    affectedTeams: (names: string) => `Applies to: ${names}.`,
    toTeam: (name: string) => `Go to ${name}`,
    handOverCaptain: "Hand over captain role",
    handOverConfirm: (team: string) => `Really hand over the captain role in ${team}?`,
    newCaptainFor: (team: string) => `New captain for ${team}`,
    chooseNewCaptain: "Choose a new captain…",
    consequences: {
      deleted:
        "Your name, email address, password and avatar, your verification with its reviews and files, messages to you, your messages to other teams and your sessions will be deleted.",
      discordIdKept:
        "Your Discord ID stays stored with the ban, so the ban still applies if you sign in again.",
      discordUnlinked: "The link to your Discord account will be deleted.",
      teamDissolved: (team: string) => `Your team ${team} will be dissolved.`,
      teamLeft: (team: string) => `You'll leave your team ${team}.`,
      pastScrims: "Past scrims stay, anonymised, for the team statistics.",
      hubServer:
        "You won't be removed from the Uni Scrims Discord server. You can leave it yourself.",
    },
  },
);

/** Flash toasts and errors of the account actions. */
export const accountActionMessages = dictionary(
  {
    confirmDeletion: "Bitte bestätige, dass du dein Konto löschen willst.",
    rankSaved: "Rang gespeichert",
    notificationsSaved: "Benachrichtigungen gespeichert",
    nameSaved: "Name gespeichert",
    emailLinkSent: "Wir haben dir einen Link an die neue Adresse geschickt",
    passwordChanged: "Passwort geändert",
    captainHandedOver: "Captain-Rolle übertragen",
    oplLinked: "OPL-Profil verknüpft",
    oplUnlinked: "OPL-Verknüpfung gelöst",
  },
  {
    confirmDeletion: "Please confirm that you want to delete your account.",
    rankSaved: "Rank saved",
    notificationsSaved: "Notifications saved",
    nameSaved: "Name saved",
    emailLinkSent: "We've sent you a link to the new address",
    passwordChanged: "Password changed",
    captainHandedOver: "Captain role handed over",
    oplLinked: "OPL profile linked",
    oplUnlinked: "OPL unlinked",
  },
);

/** Discord and mail per notification (SPEC N-14). */
export const notificationsPageMessages = dictionary(
  {
    title: "Einstellungen",
    /** Below the label of a notification, by its audience. */
    hints: {
      SELF: null,
      CAPTAIN: "Nur als Captain",
      TEAM: "Für Captains standardmäßig an",
    },
    /** `name` and `email` come styled from the page; without a deliverable address no email. */
    intro: (name: ReactNode, email: ReactNode | null) => (
      <>
        Wähle für jede Benachrichtigung, ob sie per Discord-DM, per Mail oder auf beiden Wegen
        kommt. DMs gehen an {name}
        {email ? <>, Mails an {email}</> : null}. Scrim-Benachrichtigungen bekommt ohne eigene Wahl
        nur der Captain; als Mitglied kannst du sie hier für dich einschalten.
      </>
    ),
    /** Captain in one team, member in another: no single default (§5.20). */
    mixedRoles:
      " Du bist in einem Team Captain und in einem anderen nicht: Ohne eigene Wahl bekommst du Scrim-Benachrichtigungen nur für deine Teams als Captain. Was du hier änderst, gilt für alle deine Teams.",
    notSwitchable:
      "Nicht abschaltbar sind die Mails zu deinem Konto (Bestätigung, Passwort, neue Adresse) und die Posts im Team-Channel; die gehören zum ganzen Team.",
  },
  {
    title: "Settings",
    hints: {
      SELF: null,
      CAPTAIN: "Only as captain",
      TEAM: "On by default for captains",
    },
    intro: (name: ReactNode, email: ReactNode | null) => (
      <>
        Choose for each notification whether it comes by Discord DM, by email or both. DMs go to{" "}
        {name}
        {email ? <>, emails to {email}</> : null}. Without a choice of your own, only the captain
        gets scrim notifications; as a member, you can switch them on for yourself here.
      </>
    ),
    mixedRoles:
      " You're the captain in one team but not in another: without a choice of your own, you only get scrim notifications for the teams you captain. What you change here applies to all your teams.",
    notSwitchable:
      "You can't switch off the emails about your account (confirmation, password, new address) or the posts in the team channel; they belong to the whole team.",
  },
);

/** What an account still lacks, one step at a time (SPEC N-3). */
export const setupPageMessages = dictionary(
  {
    /** Errors the Discord link sends back as ?error= (§5.8). */
    discordAlreadyLinked: "Dieses Discord-Konto gehört schon zu einem anderen Uni-Scrims-Konto.",
    discordLinkFailed: "Das Verknüpfen hat nicht geklappt. Bitte versuch es erneut.",
    completeTitle: "Konto vervollständigen",
    completeText:
      "Ab jetzt meldest du dich mit E-Mail und Passwort an; Discord bleibt verknüpft. Deinen Namen vergleichen unsere Prüfer mit deiner Immatrikulationsbescheinigung, deshalb so wie dort. Teams und Gegner sehen weiter nur deinen Discord-Namen.",
    completeNotice:
      "Deine bisherige Verifizierung gilt danach nicht mehr: Lade deine Bescheinigung bitte neu hoch, damit wir sie mit deinem Namen abgleichen können.",
    completeSubmit: "Speichern und Link schicken",
    verifyEmailTitle: "Bestätige deine E-Mail-Adresse",
    verifyEmailText: (email: string) =>
      `Wir haben dir einen Link an ${email} geschickt. Er ist 24 Stunden gültig. Keine Mail bekommen? Schau im Spam-Ordner nach.`,
    verifyEmailLinkInvalid: "Der Link ist ungültig oder abgelaufen. Lass dir einen neuen schicken.",
    resendLink: "Link noch einmal schicken",
    discordTitle: "Discord verknüpfen",
    discordText:
      "Über Discord bekommst du Bewerbungen, Zusagen und Reminder, und gegnerische Captains finden dich dort. Dabei wirst du automatisch dem Uni-Scrims-Discord-Server hinzugefügt; nur so kann unser Bot dir Nachrichten schicken.",
    linkDiscord: "Discord verknüpfen",
    signOutOrDelete: (link: LinkPart) => (
      <>Abmelden geht über das Konto-Menü, dein Konto löschen unter {link("Einstellungen")}.</>
    ),
  },
  {
    discordAlreadyLinked: "This Discord account already belongs to another Uni Scrims account.",
    discordLinkFailed: "Linking didn't work. Please try again.",
    completeTitle: "Complete your account",
    completeText:
      "From now on, you sign in with email and password; Discord stays linked. Our reviewers compare your name with your enrolment certificate, so enter it exactly as it appears there. Teams and opponents still only see your Discord name.",
    completeNotice:
      "Your previous verification will no longer count after this: please upload your certificate again so we can match it with your name.",
    completeSubmit: "Save and send link",
    verifyEmailTitle: "Confirm your email address",
    verifyEmailText: (email: string) =>
      `We've sent a link to ${email}. It's valid for 24 hours. No email? Check your spam folder.`,
    verifyEmailLinkInvalid: "The link is invalid or has expired. Request a new one.",
    resendLink: "Send link again",
    discordTitle: "Link Discord",
    discordText:
      "On Discord, you get applications, confirmations and reminders, and opposing captains can find you there. You'll be added to the Uni Scrims Discord server automatically; that's the only way our bot can send you messages.",
    linkDiscord: "Link Discord",
    signOutOrDelete: (link: LinkPart) => (
      <>You can sign out from the account menu and delete your account under {link("Settings")}.</>
    ),
  },
);

/** Flash toasts of the setup actions. */
export const setupActionMessages = dictionary(
  { linkSentAgain: "Wir haben dir den Link noch einmal geschickt" },
  { linkSentAgain: "We've sent you the link again" },
);

/** The verification as a tab of the settings (SPEC N-11, P0-2). */
export const verifyPageMessages = dictionary(
  {
    title: "Einstellungen",
    status: "Status",
    university: "Hochschule",
    verifiedTitle: "Du bist verifiziert",
    verifiedText:
      "Als Captain kannst du jetzt Scrims anfragen, und als Spieler zählst du für das Abzeichen „Vollständig verifiziert“ deines Teams.",
    verified: "Verifiziert",
    verifiedSince: "Verifiziert seit",
    toBoard: "Zum Board",
    toTeam: "Zum Team",
    pendingTitle: "Wir prüfen deine Bescheinigung",
    pendingText: "Sobald wir fertig sind, bekommst du eine Discord-Nachricht.",
    pending: "In Prüfung",
    submitted: "Eingereicht",
    previewBoard: "Board schon mal ansehen",
    rejectedTitle: "Das hat leider nicht geklappt",
    rejectedText: "Wir konnten deinen Studierendenstatus mit diesem Dokument nicht bestätigen.",
    reason: "Grund",
    uploadNew: "Neues Dokument hochladen",
    uploadTitle: "Bestätige deinen Studierendenstatus",
    uploadText:
      "Uni Scrims ist für Teams deutscher Hochschulen. Als Captain brauchst du die Verifizierung für Scrims; als Spieler ist sie freiwillig und zählt für das Abzeichen „Vollständig verifiziert“ deines Teams. Lade dazu deine aktuelle Immatrikulationsbescheinigung hoch.",
    /** "Darauf achten wir", with the current semester. */
    checks: (semester: string) => [
      "Dein Name ist gut lesbar",
      `Aktuelles Semester (${semester})`,
      "Name der Hochschule ist sichtbar",
    ],
  },
  {
    title: "Settings",
    status: "Status",
    university: "University",
    verifiedTitle: "You're verified",
    verifiedText:
      "As captain, you can now request scrims, and as a player you count towards your team's “Fully verified” badge.",
    verified: "Verified",
    verifiedSince: "Verified since",
    toBoard: "Go to the board",
    toTeam: "Go to your team",
    pendingTitle: "We're reviewing your certificate",
    pendingText: "Once we're done, you'll get a Discord message.",
    pending: "Under review",
    submitted: "Submitted",
    previewBoard: "Have a look at the board",
    rejectedTitle: "Unfortunately, that didn't work",
    rejectedText: "We couldn't confirm your student status with this document.",
    reason: "Reason",
    uploadNew: "Upload a new document",
    uploadTitle: "Confirm your student status",
    uploadText:
      "Uni Scrims is for teams from German universities. As captain, you need verification for scrims; as a player it's optional and counts towards your team's “Fully verified” badge. To confirm, upload your current enrolment certificate.",
    checks: (semester: string) => [
      "Your name is easy to read",
      `Current semester (${semester})`,
      "The name of the university is visible",
    ],
  },
);

/** Errors of the verification action. */
export const verifyActionMessages = dictionary(
  {
    invalidForm: "Bitte wähle deine Hochschule, lade eine Datei hoch und bestätige den Hinweis.",
  },
  { invalidForm: "Please choose your university, upload a file and confirm the notice." },
);
