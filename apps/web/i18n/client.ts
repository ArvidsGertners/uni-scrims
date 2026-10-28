// Texts of client components (§5.21), one section per component. Client components import only
// this file and common.ts, so the server dictionaries stay out of the browser bundle.
// Sentences with a link return the parts as an array, as this file has no JSX: the component passes
// the link with a key.
import { dictionary } from "@uni-scrims/core/config/locale";
import type { ReactNode } from "react";

export const localeSwitcherMessages = dictionary(
  {
    language: "Sprache",
    failed: "Die Sprache konnte nicht gespeichert werden. Bitte versuch es erneut.",
  },
  { language: "Language", failed: "The language couldn't be saved. Please try again." },
);

/** The navigation of the site (§5.15, §5.16, SPEC N-17): sidebar and menu below 1024 px. */
export const appNavMessages = dictionary(
  {
    menu: "Menü",
    mainMenu: "Hauptmenü",
    teamAndAccount: "Team und Konto",
    scrims: "Scrims",
    /** The teams list below "Scrims" (SPEC N-20). */
    teams: "Teams",
    team: "Team",
    /** Below "Team" without a team. */
    createOrJoin: "Gründen oder beitreten",
    account: "Konto",
    settings: "Einstellungen",
    support: "Support",
    adminArea: "Admin-Bereich",
    /** Opens the what's new dialog again (SPEC N-29). */
    whatsNew: "Neuigkeiten",
    signOut: "Abmelden",
    createTeam: "Neues Team erstellen",
    requestMoreTeams: "Mehr Teams beantragen",
    /** For screen readers after the checked team in the team menu. */
    active: "(aktiv)",
    activeTeam: "Aktives Team",
    /** Below another own team in the menu below 1024 px. */
    switchTeam: "Wechseln",
  },
  {
    menu: "Menu",
    mainMenu: "Main menu",
    teamAndAccount: "Team and account",
    scrims: "Scrims",
    teams: "Teams",
    team: "Team",
    createOrJoin: "Create or join",
    account: "Account",
    settings: "Settings",
    support: "Support",
    adminArea: "Admin area",
    whatsNew: "What's new",
    signOut: "Sign out",
    createTeam: "Create a new team",
    requestMoreTeams: "Request more teams",
    active: "(active)",
    activeTeam: "Active team",
    switchTeam: "Switch",
  },
);

export const logoutMessages = dictionary(
  {
    signOut: "Abmelden",
    failed: "Abmelden hat nicht geklappt. Bitte versuch es erneut.",
  },
  {
    signOut: "Sign out",
    failed: "Signing out didn't work. Please try again.",
  },
);

export const copyValueMessages = dictionary(
  {
    copy: "Kopieren",
    copied: "Kopiert",
    failed: "Kopieren ging nicht. Der Text ist markiert, kopier ihn bitte selbst.",
  },
  {
    copy: "Copy",
    copied: "Copied",
    failed: "Copying didn't work. The text is selected, please copy it yourself.",
  },
);

/** The rank filter of the board and the teams list (components/rank-filter.tsx). */
export const rankFilterMessages = dictionary({ allRanks: "Alle Ränge" }, { allRanks: "All ranks" });

/** The league filter of the board and the teams list (components/league-filter.tsx, SPEC N-36). */
export const leagueFilterMessages = dictionary(
  { allLeagues: "Alle Ligen" },
  { allLeagues: "All leagues" },
);

/** The dialog that asks before a final action (components/confirm-dialog.tsx). */
export const confirmDialogMessages = dictionary({ cancel: "Abbrechen" }, { cancel: "Cancel" });

/** Pages shown as a dialog over the current page (SPEC N-31). */
export const routeDialogMessages = dictionary({ close: "Schließen" }, { close: "Close" });

/** The question before a dialog with unsaved changes closes (SPEC N-31). */
export const dirtyGuardMessages = dictionary(
  {
    title: "Ungespeicherte Änderungen",
    text: "Deine Änderungen sind noch nicht gespeichert.",
    textCreate: "Dein Formular ist noch nicht abgeschickt.",
    saveAndLeave: "Speichern und verlassen",
    /** In dialogs that create something: a request, a window, a request for more teams. */
    submitAndLeave: "Absenden und verlassen",
    leaveWithoutSaving: "Ohne Speichern verlassen",
    cancel: "Abbrechen",
  },
  {
    title: "Unsaved changes",
    text: "Your changes haven't been saved yet.",
    textCreate: "Your form hasn't been submitted yet.",
    saveAndLeave: "Save and leave",
    submitAndLeave: "Submit and leave",
    leaveWithoutSaving: "Leave without saving",
    cancel: "Cancel",
  },
);

export const countedTextareaMessages = dictionary(
  { optional: "optional" },
  { optional: "optional" },
);

/** Name, email, password and consent fields of the registration, login and account (SPEC N-3). */
export const accountFieldsMessages = dictionary(
  {
    firstName: "Vorname",
    lastName: "Nachname",
    email: "E-Mail-Adresse",
    password: "Passwort",
    minLength: (min: number) => `mindestens ${min} Zeichen`,
    consent: (link: (label: string) => ReactNode): ReactNode[] => [
      "Ich bin mindestens 16 Jahre alt und habe die ",
      link("Datenschutzerklärung"),
      " gelesen.",
    ],
  },
  {
    firstName: "First name",
    lastName: "Last name",
    email: "Email address",
    password: "Password",
    minLength: (min) => `at least ${min} characters`,
    consent: (link) => [
      "I am at least 16 years old and have read the ",
      link("privacy policy"),
      ".",
    ],
  },
);

export const loginFormMessages = dictionary(
  {
    submit: "Anmelden",
    forgot: "Vergessen?",
    or: "oder",
    discord: "Mit Discord anmelden",
    discordNote: "Geht, sobald du Discord mit deinem Konto verknüpft hast.",
  },
  {
    submit: "Sign in",
    forgot: "Forgot?",
    or: "or",
    discord: "Sign in with Discord",
    discordNote: "Works once you've linked Discord to your account.",
  },
);

export const warningDotMessages = dictionary(
  { unverified: "Nicht verifiziert" },
  { unverified: "Not verified" },
);

/** A calendar day; `month` 1–12, `weekday` 0 for Monday. */
export type CalendarDay = { year: number; month: number; date: number; weekday: number };

const pad = (value: number) => String(value).padStart(2, "0");

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_LONG_DE = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
const WEEKDAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAYS_MEDIUM_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG_EN = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The calendar of the date field (§5.21): names from here, never from Intl in the browser, which
 * could differ from the server's and break hydration. Weeks start on Monday in both languages.
 */
export const datePickerMessages = dictionary(
  {
    /** Column headers, from Monday. */
    weekdays: WEEKDAYS_DE,
    weekdaysLong: WEEKDAYS_LONG_DE,
    months: MONTHS_DE,
    /** The chosen day in the field, as on the request cards: "Sa, 07.11.2026". */
    day: (day: CalendarDay) =>
      `${WEEKDAYS_DE[day.weekday]}, ${pad(day.date)}.${pad(day.month)}.${day.year}`,
    /** The name of a day in the calendar: "Samstag, 7. November 2026". */
    dayLong: (day: CalendarDay) =>
      `${WEEKDAYS_LONG_DE[day.weekday]}, ${day.date}. ${MONTHS_DE[day.month - 1]} ${day.year}`,
    placeholder: "Datum wählen",
    previousMonth: "Vorheriger Monat",
    nextMonth: "Nächster Monat",
    clear: "Löschen",
    today: "Heute",
  },
  {
    weekdays: WEEKDAYS_EN,
    weekdaysLong: WEEKDAYS_LONG_EN,
    months: MONTHS_EN,
    // "Sat 7 Nov 2026", like the English request cards (no numeric date, §5.21).
    day: (day) =>
      `${WEEKDAYS_MEDIUM_EN[day.weekday]} ${day.date} ${MONTHS_EN[day.month - 1]!.slice(0, 3)} ${day.year}`,
    dayLong: (day) =>
      `${WEEKDAYS_LONG_EN[day.weekday]} ${day.date} ${MONTHS_EN[day.month - 1]} ${day.year}`,
    placeholder: "Choose a date",
    previousMonth: "Previous month",
    nextMonth: "Next month",
    clear: "Clear",
    today: "Today",
  },
);

/** A short day in client components, e.g. between chat messages (§5.30): "Di, 27.10." / "Tue 27 Oct". */
export const shortDayMessages = dictionary(
  { day: (day: CalendarDay) => `${WEEKDAYS_DE[day.weekday]}, ${pad(day.date)}.${pad(day.month)}.` },
  {
    day: (day) =>
      `${WEEKDAYS_MEDIUM_EN[day.weekday]} ${day.date} ${MONTHS_EN[day.month - 1]!.slice(0, 3)}`,
  },
);

/** components/showcase-question.tsx (SPEC N-34): the one-time question about the landing page. */
export const showcaseQuestionMessages = dictionary(
  {
    title: (count: number): string =>
      count === 1 ? "Euer Team auf der Startseite?" : "Eure Teams auf der Startseite?",
    text: (max: number) =>
      `Auf der Startseite zeigen wir jetzt bis zu ${max} echte Teams aus der Teams-Liste mit Logo, Name, Hochschulen, Team-Rang und Zuverlässigkeit, für alle Besucher, auch ohne Anmeldung. Mitglieder stehen dort nicht. Ihr könnt das jederzeit in den Team-Einstellungen ändern.`,
    yes: "Zeigen",
    no: "Nicht zeigen",
    save: "Speichern",
    close: "Schließen",
    closeHint: "Schließen gilt als „Nicht zeigen“.",
  },
  {
    title: (count) =>
      count === 1 ? "Your team on the home page?" : "Your teams on the home page?",
    text: (max) =>
      `The home page now shows up to ${max} real teams from the teams list with logo, name, universities, team rank and reliability, to all visitors, even without signing in. Members are not shown there. You can change this any time in the team settings.`,
    yes: "Show",
    no: "Don't show",
    save: "Save",
    close: "Close",
    closeHint: "Closing counts as “Don't show”.",
  },
);

/** components/whats-new (SPEC N-29): one entry per slide of config/whats-new.ts. */
export const whatsNewMessages = dictionary(
  {
    kicker: "Neu bei Uni Scrims",
    close: "Schließen",
    back: "Zurück",
    next: "Weiter",
    done: "Los geht's",
    /** The dots below the slides, for screen readers. */
    goTo: (index: number, title: string) => `Folie ${index}: ${title}`,
    position: (index: number, count: number) => `${index} von ${count}`,
    /** Words inside the art; the league badge comes from leagueMessages. */
    art: {
      opl: "OPL",
      allowed: "Erlaubt",
    },
    slides: {
      bell: {
        title: "Alles an einem Ort",
        text: "Oben rechts sammelt die Glocke jede Benachrichtigung, live und in jedem offenen Tab. Ein Klick führt zur passenden Seite, „Alle als gelesen“ räumt auf.",
        cta: "Benachrichtigungen einstellen",
      },
      opl: {
        title: "Mit OPL verknüpft",
        text: "Verknüpft euer OPL-Profil und euer OPL-Team, abgeglichen über die Discord-ID. Im Tab „Team“ seht ihr, wer aus eurem Kader auf OPL steht.",
        cta: "Zu den Einstellungen",
      },
      uniligaLeague: {
        title: "Eure Uniliga-Liga",
        text: "Mit OPL verknüpfte Teams zeigen ihre Liga aus der aktuellen Uniliga-Saison. Board und Teams-Liste filtern danach, so findet ihr Gegner auf eurem Niveau.",
        cta: "Zur Teams-Liste",
      },
      landingShowcase: {
        title: "Ab auf die Startseite",
        text: "Captains können erlauben, dass ihr Team auf der Startseite steht, mit Logo, Team-Rang und Zuverlässigkeit. Ohne Zustimmung erscheint dort kein Team.",
        cta: "Zu den Team-Einstellungen",
      },
    },
  },
  {
    kicker: "New on Uni Scrims",
    close: "Close",
    back: "Back",
    next: "Next",
    done: "Let's go",
    goTo: (index, title) => `Slide ${index}: ${title}`,
    position: (index, count) => `${index} of ${count}`,
    art: {
      opl: "OPL",
      allowed: "Allowed",
    },
    slides: {
      bell: {
        title: "Everything in one place",
        text: "Up top on the right, the bell collects every notification, live and in every open tab. One click takes you there, “Mark all as read” tidies up.",
        cta: "Notification settings",
      },
      opl: {
        title: "Linked with OPL",
        text: "Link your OPL profile and your OPL team, matched by your Discord ID. The “Team” tab shows who from your roster is on OPL.",
        cta: "Go to settings",
      },
      uniligaLeague: {
        title: "Your Uniliga division",
        text: "Teams linked with OPL show their division from the current Uniliga season. The board and the teams list filter by it, so you find opponents at your level.",
        cta: "Go to the teams list",
      },
      landingShowcase: {
        title: "Onto the front page",
        text: "Captains can allow their team to appear on the front page, with logo, team rank and reliability. Without consent, no team shows up there.",
        cta: "Go to team settings",
      },
    },
  },
);

/** components/notification-bell (SPEC N-32, §5.34); the texts of the entries come from core. */
export const notificationBellMessages = dictionary(
  {
    title: "Benachrichtigungen",
    /** The name of the button, with the number of unread entries. */
    button: (unread: number) =>
      unread === 0 ? "Benachrichtigungen" : `Benachrichtigungen, ${unread} ungelesen`,
    /** The badge above 9. */
    many: "9+",
    markAllRead: "Alle als gelesen",
    loading: "Wird geladen …",
    failed: "Die Benachrichtigungen konnten nicht geladen werden. Bitte versuch es erneut.",
    empty: "Noch keine Benachrichtigungen. Hier erscheint alles zu euren Anfragen und Scrims.",
    unread: "Ungelesen",
    whatsNew: "Neuigkeiten",
    whatsNewText: "Sieh dir an, was es Neues bei Uni Scrims gibt.",
    justNow: "gerade eben",
    minutesAgo: (minutes: number) => `vor ${minutes} Min.`,
    hoursAgo: (hours: number) => `vor ${hours} Std.`,
    daysAgo: (days: number) => (days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`),
  },
  {
    title: "Notifications",
    button: (unread) => (unread === 0 ? "Notifications" : `Notifications, ${unread} unread`),
    many: "9+",
    markAllRead: "Mark all as read",
    loading: "Loading …",
    failed: "The notifications couldn't be loaded. Please try again.",
    empty: "No notifications yet. Everything about your requests and scrims shows up here.",
    unread: "Unread",
    whatsNew: "What's new",
    whatsNewText: "See what's new on Uni Scrims.",
    justNow: "just now",
    minutesAgo: (minutes) => `${minutes} min ago`,
    hoursAgo: (hours) => (hours === 1 ? "1 hour ago" : `${hours} hours ago`),
    daysAgo: (days) => (days === 1 ? "1 day ago" : `${days} days ago`),
  },
);
