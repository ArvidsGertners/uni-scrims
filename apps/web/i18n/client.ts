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
    team: "Team",
    /** Below "Team" without a team. */
    createOrJoin: "Gründen oder beitreten",
    account: "Konto",
    settings: "Einstellungen",
    support: "Support",
    adminArea: "Admin-Bereich",
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
    team: "Team",
    createOrJoin: "Create or join",
    account: "Account",
    settings: "Settings",
    support: "Support",
    adminArea: "Admin area",
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
