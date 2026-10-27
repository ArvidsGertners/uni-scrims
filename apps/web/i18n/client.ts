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

/** components/whats-new (SPEC N-29): one entry per slide of config/whats-new.ts. */
export const whatsNewMessages = dictionary(
  {
    kicker: "Neu bei Uni Scrims",
    /** The badge in the art of the messages slide. */
    live: "LIVE",
    close: "Schließen",
    back: "Zurück",
    next: "Weiter",
    done: "Los geht's",
    /** The dots below the slides, for screen readers. */
    goTo: (index: number, title: string) => `Folie ${index}: ${title}`,
    position: (index: number, count: number) => `${index} von ${count}`,
    slides: {
      messages: {
        title: "Absprechen, ohne Discord",
        text: "Schreibt euch direkt an Bewerbung, Direktanfrage und Scrim mit dem anderen Team, live und für alle Mitglieder beider Teams. Wartet eine neue Nachricht auf euch, bekommt ihr Bescheid.",
        cta: "Zu euren Scrims",
      },
      readyToday: {
        title: "Heute spielbereit",
        text: "Meldet, wann ihr heute starten könnt. Andere Teams sehen euer Zeitfenster auf dem Board, wählen eine Startzeit und fragen euch mit einem Klick an.",
        cta: "Zum Board",
      },
      directRequests: {
        title: "Direkt anfragen, fest verabreden",
        text: "Fragt ein Team aus der Teams-Liste oder nach einem Scrim direkt an, ohne dass es auf dem Board steht. Mit „Jede Woche bis …“ wird daraus eine feste Partnerschaft, die sich jede Woche selbst bucht.",
        cta: "Zur Teams-Liste",
      },
      weeklyRequests: {
        title: "Einmal anlegen, jede Woche da",
        text: "Eine Anfrage wiederholt sich auf Wunsch jede Woche bis zu einem Enddatum. Die nächste erscheint von selbst, sobald die vorige beginnt.",
        cta: "Anfrage erstellen",
      },
    },
  },
  {
    kicker: "New on Uni Scrims",
    live: "LIVE",
    close: "Close",
    back: "Back",
    next: "Next",
    done: "Let's go",
    goTo: (index, title) => `Slide ${index}: ${title}`,
    position: (index, count) => `${index} of ${count}`,
    slides: {
      messages: {
        title: "Sort it out without Discord",
        text: "Write to the other team right at the application, direct request and scrim, live and for every member of both teams. When a new message waits for you, you get notified.",
        cta: "Go to your scrims",
      },
      readyToday: {
        title: "Ready today",
        text: "Say when you can start today. Other teams see your window on the board, pick a start time and send you a request with one click.",
        cta: "Go to the board",
      },
      directRequests: {
        title: "Ask directly, play regularly",
        text: "Send a request straight to a team from the teams list or after a scrim, without it showing on the board. With “Every week until …” it becomes a fixed partnership that books itself every week.",
        cta: "Go to the teams list",
      },
      weeklyRequests: {
        title: "Create once, there every week",
        text: "A request can repeat every week up to an end date. The next one appears by itself as soon as the previous one starts.",
        cta: "Create a request",
      },
    },
  },
);
