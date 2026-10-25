// Texts of the public pages (§5.21): landing page, login, registration, password, support, legal
// pages and the dev login. Sentences with a link are render props, so the markup stays in the page.
import { dictionary } from "@uni-scrims/core/config/locale";
import type { ReactNode } from "react";

type LinkRender = (label: string) => ReactNode;

/** The landing page with its hero (SPEC N-3). */
export const landingMessages = dictionary(
  {
    eyebrow: "Valorant-Scrims für Hochschulteams",
    title: "Scrims gegen andere Uni-Teams. Ohne Suchen in zehn Discords.",
    lead: "Postet eure Anfrage aufs Board, bewerbt euch bei anderen Teams und klärt die Lobby direkt auf Discord.",
    studentsOnly: "Nur für eingeschriebene Studierende deutscher Hochschulen.",
    howItWorks: "So funktioniert's",
    steps: [
      {
        title: "Konto anlegen, Discord verknüpfen",
        text: "Mit E-Mail und Passwort. Über Discord bekommst du danach Bewerbungen, Zusagen und Reminder.",
      },
      {
        title: "Studierendenstatus bestätigen",
        text: "Lade deine Immatrikulationsbescheinigung hoch. Wir prüfen sie von Hand.",
      },
      {
        title: "Team bilden, Scrims spielen",
        text: "Mindestens 5 verifizierte Spieler, höchstens 10 Mitglieder pro Team. Anfragen posten, bewerben und nach dem Match kurz Feedback geben.",
      },
    ],
    bannedNotice: (link: LinkRender) => (
      <>Dein Konto ist gesperrt. Du kannst es unter {link("Einstellungen")} löschen.</>
    ),
    deletedNotice: "Dein Konto wurde gelöscht.",
    toBoard: "Zum Board",
    createAccount: "Konto erstellen",
    signIn: "Anmelden",
  },
  {
    eyebrow: "Valorant scrims for university teams",
    title: "Scrims against other uni teams. Without searching ten Discords.",
    lead: "Post your request on the board, apply to other teams and sort out the lobby directly on Discord.",
    studentsOnly: "Only for enrolled students of German universities.",
    howItWorks: "How it works",
    steps: [
      {
        title: "Create an account, link Discord",
        text: "With email and password. After that, Discord brings you applications, confirmations and reminders.",
      },
      {
        title: "Confirm your student status",
        text: "Upload your enrolment certificate. We review it by hand.",
      },
      {
        title: "Build a team, play scrims",
        text: "At least 5 verified players, at most 10 members per team. Post requests, apply and give quick feedback after the match.",
      },
    ],
    bannedNotice: (link) => (
      <>Your account is banned. You can delete it under {link("Settings")}.</>
    ),
    deletedNotice: "Your account has been deleted.",
    toBoard: "Go to the board",
    createAccount: "Create account",
    signIn: "Sign in",
  },
);

/** The login page (SPEC N-3) and the errors that come back as ?error= (§5.8, §5.9). */
export const loginMessages = dictionary(
  {
    title: "Anmelden",
    errors: {
      signupDisabled:
        "Zu diesem Discord-Konto gibt es noch kein Uni-Scrims-Konto. Registriere dich mit deiner E-Mail-Adresse und verknüpfe Discord danach.",
      staffDiscord:
        "Admins und Prüfer melden sich mit E-Mail-Adresse, Passwort und Code an, nicht mit Discord.",
      staffLink:
        "Als Admin oder Prüfer öffnest du Links aus unseren Mails, während du angemeldet bist. Melde dich an und öffne den Link danach noch einmal.",
      other: "Die Anmeldung hat nicht geklappt. Bitte versuch es erneut.",
    },
    noAccount: (link: LinkRender) => <>Noch kein Konto? {link("Registrieren")}</>,
  },
  {
    title: "Sign in",
    errors: {
      signupDisabled:
        "There's no Uni Scrims account for this Discord account yet. Sign up with your email address and link Discord afterwards.",
      staffDiscord:
        "Admins and reviewers sign in with email address, password and code, not with Discord.",
      staffLink:
        "As an admin or reviewer, you open links from our emails while you're signed in. Sign in and then open the link again.",
      other: "Signing in didn't work. Please try again.",
    },
    noAccount: (link) => <>No account yet? {link("Sign up")}</>,
  },
);

/** The second step of a staff login (§5.9). */
export const loginCodeMessages = dictionary(
  {
    title: "Code eingeben",
    lead: "Gib den sechsstelligen Code aus deiner Authenticator-App ein. Hast du dein Gerät nicht zur Hand, nimm einen deiner Backup-Codes.",
    submit: "Anmelden",
    code: "Code",
    backup: "Das ist ein Backup-Code",
    noAccess: (link: LinkRender) => (
      <>
        Kein Zugriff mehr auf App und Backup-Codes? Der Betreiber kann deine Zwei-Faktor-Anmeldung
        zurücksetzen. {link("Zurück zur Anmeldung")}
      </>
    ),
  },
  {
    title: "Enter code",
    lead: "Enter the six-digit code from your authenticator app. If you don't have your device to hand, use one of your backup codes.",
    submit: "Sign in",
    code: "Code",
    backup: "This is a backup code",
    noAccess: (link) => (
      <>
        Lost access to the app and your backup codes? The operator can reset your two-factor
        sign-in. {link("Back to sign-in")}
      </>
    ),
  },
);

/** The registration and the page after it (SPEC N-3). */
export const registerMessages = dictionary(
  {
    title: "Konto erstellen",
    lead: "Gib deinen Namen so an, wie er auf deiner Immatrikulationsbescheinigung steht. Unsere Prüfer vergleichen ihn damit; Teams und Gegner sehen nur deinen Discord-Namen.",
    submit: "Konto erstellen",
    haveAccount: (link: LinkRender) => <>Schon ein Konto? {link("Anmelden")}</>,
    sentTitle: "Schau in dein Postfach",
    sentText:
      "Wir haben dir einen Link zum Bestätigen deiner E-Mail-Adresse geschickt. Er ist 24 Stunden gültig und meldet dich an. Danach verknüpfst du noch Discord.",
    noMail: (link: LinkRender) => (
      <>
        Keine Mail bekommen? Schau im Spam-Ordner nach. Wenn du dich {link("anmeldest")}, schicken
        wir den Link noch einmal.
      </>
    ),
  },
  {
    title: "Create account",
    lead: "Enter your name as it appears on your enrolment certificate. Our reviewers compare the two; teams and opponents only see your Discord name.",
    submit: "Create account",
    haveAccount: (link) => <>Already have an account? {link("Sign in")}</>,
    sentTitle: "Check your inbox",
    sentText:
      "We've sent you a link to confirm your email address. It's valid for 24 hours and signs you in. After that, you link Discord.",
    noMail: (link) => (
      <>
        Didn&apos;t get an email? Check your spam folder. If you {link("sign in")}, we&apos;ll send
        the link again.
      </>
    ),
  },
);

/** Forgotten password and the new one (§5.8). */
export const passwordMessages = dictionary(
  {
    forgotTitle: "Passwort vergessen",
    forgotLead:
      "Gib die E-Mail-Adresse deines Kontos an. Wir schicken dir einen Link, über den du ein neues Passwort setzt.",
    sent: "Falls es ein Konto mit dieser Adresse gibt, haben wir dir einen Link geschickt. Er ist 1 Stunde gültig.",
    send: "Link schicken",
    resetTitle: "Neues Passwort",
    newPassword: "Neues Passwort",
    save: "Passwort speichern",
    invalidLink: (link: LinkRender) => (
      <>Der Link ist ungültig oder abgelaufen. {link("Neuen Link anfordern")}</>
    ),
    changed: "Dein Passwort ist geändert. Bitte melde dich an.",
  },
  {
    forgotTitle: "Forgot password",
    forgotLead:
      "Enter the email address of your account. We'll send you a link to set a new password.",
    sent: "If there's an account with this address, we've sent you a link. It's valid for 1 hour.",
    send: "Send link",
    resetTitle: "New password",
    newPassword: "New password",
    save: "Save password",
    invalidLink: (link) => <>The link is invalid or has expired. {link("Request a new link")}</>,
    changed: "Your password has been changed. Please sign in.",
  },
);

/** How to reach us and the request for more teams (SPEC N-13, N-17). */
export const supportMessages = dictionary(
  {
    title: "Support",
    lead: "Fragen, Probleme oder Feedback? So erreichst du uns. Geht es um dein Konto, nenn uns deine Profil-ID aus den Einstellungen.",
    discord: "Discord",
    discordText: "Auf dem Uni-Scrims-Server erreichst du uns und die anderen Teams.",
    discordLink: "Zum Discord-Server",
    email: "E-Mail",
    emailText:
      "Für alles, was nicht öffentlich sein soll, etwa Fragen zu deinem Konto oder deinen Daten.",
    contactInImpressum: (link: LinkRender) => (
      <>Unsere Kontaktdaten stehen im {link("Impressum")}.</>
    ),
    teamLimitTitle: "Mehr Teams beantragen",
    teamLimitText: (count: number, limit: number) =>
      `Du bist in ${count} von ${limit} Teams. Brauchst du mehr, etwa weil du mehrere Teams betreust, schreib kurz, wofür. Ein Admin entscheidet; den Stand siehst du hier.`,
    pending: (date: string) => `Dein Antrag vom ${date} ist in Prüfung.`,
    approved: (date: string, limit: number) =>
      `Angenommen am ${date}: Du kannst jetzt in bis zu ${limit} Teams sein.`,
    rejected: (date: string) =>
      `Dein Antrag vom ${date} wurde abgelehnt. Du kannst einen neuen stellen.`,
    submit: "Antrag senden",
    reason: "Begründung",
    reasonPlaceholder: "Zum Beispiel: Ich betreue die Teams unserer Hochschule.",
    sent: "Antrag gesendet",
  },
  {
    title: "Support",
    lead: "Questions, problems or feedback? Here's how to reach us. If it's about your account, give us your profile ID from the settings.",
    discord: "Discord",
    discordText: "On the Uni Scrims server you can reach us and the other teams.",
    discordLink: "Go to the Discord server",
    email: "Email",
    emailText:
      "For anything that shouldn't be public, such as questions about your account or your data.",
    contactInImpressum: (link) => <>Our contact details are in the {link("legal notice")}.</>,
    teamLimitTitle: "Request more teams",
    teamLimitText: (count, limit) =>
      `You're in ${count} of ${limit} teams. If you need more, for example because you look after several teams, briefly tell us why. An admin decides; you'll see the status here.`,
    pending: (date) => `Your request from ${date} is under review.`,
    approved: (date, limit) => `Approved on ${date}: you can now be in up to ${limit} teams.`,
    rejected: (date) => `Your request from ${date} was rejected. You can submit a new one.`,
    submit: "Send request",
    reason: "Reason",
    reasonPlaceholder: "For example: I look after our university's teams.",
    sent: "Request sent",
  },
);

// Riot's wording, word for word in both languages (ARCHITECTURE §5.19).
const RIOT_NOTICE =
  'Uni Scrims was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.';
const RIOT_NOTICE_DE =
  "Uni Scrims wurde unter der Richtlinie „Legal Jibber Jabber“ von Riot Games mit Assets erstellt, die Riot Games gehören. Riot Games unterstützt oder sponsert dieses Projekt nicht.";

/** Impressum and privacy policy; the texts come from LEGAL_DIR (SPEC P0-10). */
export const legalMessages = dictionary(
  {
    impressumTitle: "Impressum",
    privacyTitle: "Datenschutzerklärung",
    contentToFollow: "Inhalt folgt.",
    /** Above the German text when the English version is missing (never shown in German). */
    germanOnly: "Diese Seite gibt es nur auf Deutsch.",
    /** The translation of the Riot notice, null where the original is enough. */
    riotTranslation: RIOT_NOTICE_DE as string | null,
    riotOriginal: RIOT_NOTICE,
  },
  {
    impressumTitle: "Legal notice",
    privacyTitle: "Privacy policy",
    contentToFollow: "Content coming soon.",
    germanOnly: "This page is only available in German.",
    riotTranslation: null,
    riotOriginal: RIOT_NOTICE,
  },
);

/** Dev only (ARCHITECTURE §7). */
export const devLoginMessages = dictionary(
  {
    title: "Dev-Login",
    note: "Dev-Login als Seed-Nutzer",
  },
  {
    title: "Dev login",
    note: "Dev login as a seed user",
  },
);
