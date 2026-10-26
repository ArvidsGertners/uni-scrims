// Texts of the public pages (§5.21): landing page, login, registration, password, support, legal
// pages and the dev login. Sentences with a link are render props, so the markup stays in the page.
import { FULLY_VERIFIED_PLAYER_COUNT, MAX_TEAM_MEMBERS } from "@uni-scrims/core/config/limits";
import { dictionary } from "@uni-scrims/core/config/locale";
import type { ReactNode } from "react";

type LinkRender = (label: string) => ReactNode;

/**
 * The landing page (docs/design_handoff_landing_page, hero B). The board preview uses made-up
 * teams; their universities are translated, as they are not real ones.
 */
export const landingMessages = dictionary(
  {
    eyebrow: "Valorant-Scrims für Hochschulteams",
    title: "Scrims gegen andere Uni-Teams.",
    titleMuted: "Ohne Suchen in zehn Discords.",
    lead: "Postet eure Anfrage aufs Board, bewerbt euch bei anderen Teams und klärt die Lobby direkt auf Discord.",
    studentsOnly: "Nur für Teams deutscher Hochschulen mit verifiziertem Captain.",
    preview: {
      south: "Uni Süd",
      west: "HS West",
      east: "TU Ost",
      central: "HS Mitte",
    },
    howItWorks: "So funktioniert's",
    stepsTitle: "In drei Schritten zum ersten Scrim.",
    steps: [
      {
        title: "Konto anlegen, Discord verknüpfen",
        text: "Mit E-Mail und Passwort. Über Discord bekommst du danach Bewerbungen, Zusagen und Reminder.",
      },
      {
        title: "Studierendenstatus bestätigen",
        text: "Lade deine Immatrikulationsbescheinigung hoch. Wir prüfen sie von Hand und löschen sie danach. Für Scrims reicht es, wenn der Captain verifiziert ist.",
      },
      {
        title: "Team bilden, Scrims spielen",
        text: `Höchstens ${MAX_TEAM_MEMBERS} Mitglieder pro Team. Mit mindestens ${FULLY_VERIFIED_PLAYER_COUNT} verifizierten Spielern bekommt euer Team das Abzeichen „Vollständig verifiziert“.`,
      },
    ],
    discord: "Discord",
    linked: "Verknüpft",
    certificateFile: "Immatrikulation.pdf",
    inReview: "In Prüfung",
    verifiedCount: (count: number) => `${count} verifiziert`,
    maxCount: (count: number) => `max. ${count}`,
    features: "Funktionen",
    featuresTitle: "Alles, was ein Scrim braucht.",
    board: {
      title: "Scrim-Board",
      text: "Offene Anfragen anderer Uni-Teams mit Datum, Startzeit (deutsche Zeit), Format, Maps und Rang-Range.",
      rankInRange: "Rang im Bereich",
    },
    applications: {
      title: "Anfragen und Bewerbungen",
      text: "Postet eine Anfrage, andere Teams bewerben sich. Der Captain nimmt ein Team an, alle anderen werden automatisch benachrichtigt.",
    },
    bot: {
      title: "Discord-Bot",
      text: "DMs und Posts im Discord-Channel eures Teams: Bewerbungen, Zusagen, Absagen, Reminder 24 h und 1 h vorher und die Bitte um Feedback.",
      newApplication: "Neue Bewerbung",
      booked: "Bestätigt",
      reminder: "Reminder",
      feedback: "Feedback",
    },
    /** Scrim channel and Uni Scrims side by side (SPEC N-22); only what exists. */
    why: {
      eyebrow: "Warum Uni Scrims?",
      title: "Mehr als ein Scrim-Channel.",
      channel: "Im Scrim-Channel",
      uniScrims: "Auf Uni Scrims",
      /** Before each cell, for screen readers: which side it belongs to. */
      srSide: (side: string) => `${side}: `,
      rows: [
        {
          channel: "Alte Anfragen bleiben stehen",
          uniScrims: "Anfragen verfallen zur Startzeit, Gebuchtes verschwindet vom Board",
        },
        {
          channel: "Zusagen gehen im Chat unter",
          uniScrims:
            "Teams bewerben sich, ihr nehmt eins an, alle anderen bekommen automatisch Bescheid",
        },
        {
          channel: "An den Termin denkt jeder selbst",
          uniScrims: "Reminder vor dem Scrim, je nach Einstellung per Discord oder Mail",
        },
        {
          channel: "No-Shows haben keine Folgen",
          uniScrims: "Gespielte Scrims, No-Shows und kurzfristige Absagen stehen am Team",
        },
        {
          channel: "Suchen heißt scrollen",
          uniScrims: "Filter nach Tag, Rang und vollständig verifizierten Teams",
        },
        {
          channel: "Ob ein Uni-Team anfragt, weiß niemand",
          uniScrims:
            "Anfragen und Bewerbungen nur von Teams mit verifiziertem Captain, Abzeichen für vollständig verifizierte Teams",
        },
      ],
    },
    reliability: "Verbindlichkeit",
    reliabilityTitle: "No-Shows werden",
    reliabilityAccent: "sichtbar.",
    reliabilityText:
      "Nach jedem Scrim sagen beide Teams, ob er stattgefunden hat. Am Team stehen gespielte Scrims, No-Shows und kurzfristige Absagen.",
    played: "Gespielt",
    noShows: "No-Shows",
    lateCancels: "Kurzfr. Absagen",
    sampleNote: "Beispielteam, ausgedachte Werte",
    faq: "FAQ",
    faqTitle: "Häufige Fragen",
    faqMore: (link: LinkRender) => <>Noch was offen? Schreib uns über den {link("Support")}.</>,
    questions: [
      {
        question: "Wer kann mitmachen?",
        answer:
          "Teams deutscher Hochschulen, alle ab 16. Wer ein Team als Captain führt, lädt die eigene Immatrikulationsbescheinigung hoch; sie wird von Hand geprüft und direkt danach gelöscht. Mitspieler können sich genauso verifizieren, müssen es aber nicht.",
      },
      {
        // Next to other scrim sites, not against them; no names (SPEC N-22).
        question: "Ersetzt Uni Scrims andere Scrim-Seiten?",
        answer:
          "Muss es nicht. Uni Scrims ist für Scrims gegen andere Uni-Teams, zur Vorbereitung auf die Uniliga. Für alle anderen Scrims nutzt ihr weiter, was ihr kennt.",
      },
      {
        question: "Brauche ich Discord?",
        answer:
          "Ja. Du verknüpfst Discord nach der Registrierung. Bewerbungen, Zusagen und Reminder kommen per Discord-DM, auf Wunsch zusätzlich per E-Mail. Die Lobby klärt ihr direkt auf Discord.",
      },
      {
        question: "Ist das kostenlos?",
        answer:
          "Ja. Uni Scrims ist ein privates, nicht-kommerzielles Studierendenprojekt: keine Werbung, keine bezahlten Funktionen, kein Tracking.",
      },
      {
        question: "Was passiert, wenn ein Team nicht auftaucht?",
        answer:
          "Nach jedem Scrim sagen beide Teams, ob er stattgefunden hat. Am Team stehen gespielte Scrims, No-Shows und kurzfristige Absagen.",
      },
      {
        question: "Können Spieler aus verschiedenen Hochschulen in einem Team sein?",
        answer: `Ja. Gemischte Teams sind erlaubt, und fällt mal jemand aus, darf auch eine Aushilfe mitspielen. Teams mit mindestens ${FULLY_VERIFIED_PLAYER_COUNT} verifizierten Spielern tragen das Abzeichen „Vollständig verifiziert“, und andere Teams können nach ihm filtern. Höchstens ${MAX_TEAM_MEMBERS} Mitglieder pro Team.`,
      },
    ],
    ctaTitle: "Euer nächster Scrim wartet schon.",
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
    title: "Scrims against other uni teams.",
    titleMuted: "Without searching ten Discords.",
    lead: "Post your request on the board, apply to other teams and sort out the lobby directly on Discord.",
    studentsOnly: "Only for teams of German universities with a verified captain.",
    preview: {
      south: "Uni South",
      west: "UAS West",
      east: "TU East",
      central: "UAS Central",
    },
    howItWorks: "How it works",
    stepsTitle: "Three steps to your first scrim.",
    steps: [
      {
        title: "Create an account, link Discord",
        text: "With email and password. After that, Discord brings you applications, confirmations and reminders.",
      },
      {
        title: "Confirm your student status",
        text: "Upload your enrolment certificate. We review it by hand and delete it afterwards. For scrims, it's enough if the captain is verified.",
      },
      {
        title: "Build a team, play scrims",
        text: `At most ${MAX_TEAM_MEMBERS} members per team. With at least ${FULLY_VERIFIED_PLAYER_COUNT} verified players, your team gets the “Fully verified” badge.`,
      },
    ],
    discord: "Discord",
    linked: "Linked",
    certificateFile: "Enrolment.pdf",
    inReview: "In review",
    verifiedCount: (count) => `${count} verified`,
    maxCount: (count) => `max. ${count}`,
    features: "Features",
    featuresTitle: "Everything a scrim needs.",
    board: {
      title: "Scrim board",
      text: "Open requests from other uni teams with date, start time (German time), format, maps and rank range.",
      rankInRange: "Rank in range",
    },
    applications: {
      title: "Requests and applications",
      text: "Post a request, other teams apply. The captain accepts one team, all others are notified automatically.",
    },
    bot: {
      title: "Discord bot",
      text: "DMs and posts in your team's Discord channel: applications, confirmations, cancellations, reminders 24 h and 1 h before, and the request for feedback.",
      newApplication: "New application",
      booked: "Confirmed",
      reminder: "Reminder",
      feedback: "Feedback",
    },
    why: {
      eyebrow: "Why Uni Scrims?",
      title: "More than a scrim channel.",
      channel: "In a scrim channel",
      uniScrims: "On Uni Scrims",
      srSide: (side) => `${side}: `,
      rows: [
        {
          channel: "Old requests stay up",
          uniScrims: "Requests expire at their start time, booked ones leave the board",
        },
        {
          channel: "Confirmations get lost in the chat",
          uniScrims: "Teams apply, you accept one, all others are notified automatically",
        },
        {
          channel: "Everyone has to remember the date",
          uniScrims: "Reminders before the scrim, by Discord or email as you choose",
        },
        {
          channel: "No-shows have no consequences",
          uniScrims: "Played scrims, no-shows and late cancellations show on the team",
        },
        {
          channel: "Searching means scrolling",
          uniScrims: "Filters by day, rank and fully verified teams",
        },
        {
          channel: "Nobody knows if a university team is asking",
          uniScrims:
            "Requests and applications only from teams with a verified captain, badge for fully verified teams",
        },
      ],
    },
    reliability: "Reliability",
    reliabilityTitle: "No-shows become",
    reliabilityAccent: "visible.",
    reliabilityText:
      "After every scrim, both teams say whether it took place. The team shows played scrims, no-shows and late cancellations.",
    played: "Played",
    noShows: "No-shows",
    lateCancels: "Late cancels",
    sampleNote: "Example team, made-up numbers",
    faq: "FAQ",
    faqTitle: "Frequently asked questions",
    faqMore: (link) => <>Anything else? Write to us through {link("Support")}.</>,
    questions: [
      {
        question: "Who can join?",
        answer:
          "Teams from German universities, everyone aged 16 or over. Whoever leads a team as captain uploads their own enrolment certificate; it is reviewed by hand and deleted right afterwards. Teammates can verify the same way, but don't have to.",
      },
      {
        question: "Does Uni Scrims replace other scrim sites?",
        answer:
          "It doesn't have to. Uni Scrims is for scrims against other university teams, to prepare for the Uniliga. For all other scrims, keep using what you already know.",
      },
      {
        question: "Do I need Discord?",
        answer:
          "Yes. You link Discord after registering. Applications, confirmations and reminders come as Discord DMs, and by email too if you like. You sort out the lobby directly on Discord.",
      },
      {
        question: "Is it free?",
        answer:
          "Yes. Uni Scrims is a private, non-commercial student project: no ads, no paid features, no tracking.",
      },
      {
        question: "What happens if a team doesn't show up?",
        answer:
          "After every scrim, both teams say whether it took place. The team shows played scrims, no-shows and late cancellations.",
      },
      {
        question: "Can players from different universities be in one team?",
        answer: `Yes. Mixed teams are allowed, and if someone can't make it, a stand-in may play too. Teams with at least ${FULLY_VERIFIED_PLAYER_COUNT} verified players carry the “Fully verified” badge, and other teams can filter by it. At most ${MAX_TEAM_MEMBERS} members per team.`,
      },
    ],
    ctaTitle: "Your next scrim is already waiting.",
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
