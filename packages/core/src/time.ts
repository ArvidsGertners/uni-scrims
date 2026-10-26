// Start times of requests in Europe/Berlin (SPEC P0-4, ARCHITECTURE §5.3).
// Input is a Berlin calendar date and wall-clock time; core converts to UTC. No time logic in the browser.
import { TZDate, tz } from "@date-fns/tz";
import { addWeeks, format, subDays } from "date-fns";
import { de, enGB } from "date-fns/locale";
import type { Locale } from "../config/locale.ts";

export const TIME_ZONE = "Europe/Berlin";

const SLOT_MINUTES = 15;
/** Starts after midnight up to 01:45 belong to the late evening window. */
const LAST_NIGHT_HOUR = 1;
const FIRST_DAY_HOUR = 10;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Allowed start times in display order: 10:00 … 23:45, then 00:00 … 01:45.
 * The window avoids the DST switch (02:00–03:00).
 */
export const START_TIME_SLOTS: readonly string[] = [
  ...Array.from({ length: 24 - FIRST_DAY_HOUR }, (_, i) => FIRST_DAY_HOUR + i),
  ...Array.from({ length: LAST_NIGHT_HOUR + 1 }, (_, i) => i),
].flatMap((hour) =>
  Array.from({ length: 60 / SLOT_MINUTES }, (_, i) => `${pad(hour)}:${pad(i * SLOT_MINUTES)}`),
);

export function isStartSlot(time: string): boolean {
  return START_TIME_SLOTS.includes(time);
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(date: string): { year: number; month: number; day: number } | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Reject dates like 2026-02-30 that Date would roll over.
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** "YYYY-MM-DD" that exists in the calendar. */
export function isValidDateString(date: string): boolean {
  return parseDate(date) !== null;
}

/** Calendar days from one valid "YYYY-MM-DD" to another, negative if `to` comes first. */
export function daysBetweenDates(from: string, to: string): number {
  const [a, b] = [parseDate(from), parseDate(to)];
  if (!a || !b) throw new Error(`Invalid date: ${from} / ${to}`);
  const utc = (date: { year: number; month: number; day: number }) =>
    Date.UTC(date.year, date.month - 1, date.day);
  return Math.round((utc(b) - utc(a)) / (24 * 60 * 60 * 1000));
}

/**
 * Berlin date ("YYYY-MM-DD") and time ("HH:MM") to a UTC instant. The date is always the calendar
 * date of the actual start: 2026-10-22 01:00 is the night from Wednesday to Thursday.
 */
export function berlinToUtc(date: string, time: string): Date {
  const parsed = parseDate(date);
  const [hours, minutes] = time.split(":").map(Number);
  if (!parsed || hours === undefined || minutes === undefined) {
    throw new Error(`Invalid Berlin date/time: ${date} ${time}`);
  }
  return new Date(
    new TZDate(parsed.year, parsed.month - 1, parsed.day, hours, minutes, TIME_ZONE).getTime(),
  );
}

/**
 * `weeks` calendar weeks later (or earlier) in Berlin, at the same wall-clock time also across a DST
 * change (series, §5.27). Start slots never fall into the DST gap, so the time always exists.
 */
export function addBerlinWeeks(date: Date, weeks: number): Date {
  return new Date(addWeeks(date, weeks, { in: tz(TIME_ZONE) }).getTime());
}

/** [start, end) of a Berlin calendar day in UTC, for the board's date filter. */
export function berlinDayRange(date: string): { from: Date; to: Date } {
  const parsed = parseDate(date);
  if (!parsed) throw new Error(`Invalid Berlin date: ${date}`);
  const from = new TZDate(parsed.year, parsed.month - 1, parsed.day, 0, 0, TIME_ZONE);
  // Day overflow is normalised by the Date constructor; DST-safe because it is wall-clock based.
  const to = new TZDate(parsed.year, parsed.month - 1, parsed.day + 1, 0, 0, TIME_ZONE);
  return { from: new Date(from.getTime()), to: new Date(to.getTime()) };
}

const berlin = { locale: de, in: tz(TIME_ZONE) };
const DATE_LOCALES = { de, en: enGB } as const;

/** Formats in Berlin time in the given language (§5.21); English as en-GB, day first and 24 h. */
function berlinFormat(date: Date, pattern: string, locale: Locale): string {
  return format(date, pattern, { locale: DATE_LOCALES[locale], in: tz(TIME_ZONE) });
}

/** The display formats per language (§5.21); English without a numeric date, which the US reads month first. */
const FORMATS = {
  de: {
    date: "dd.MM.yyyy",
    start: "EEEEEE, dd.MM.yyyy, HH:mm 'Uhr'",
    time: "HH:mm 'Uhr'",
    short: "EEEEEE dd.MM. '·' HH:mm",
    day: "EEEEEE dd.MM.",
    weekdayDate: "EEEE, dd.MM.",
    dayHeading: "EEEE, d. MMMM",
  },
  en: {
    date: "d MMM yyyy",
    start: "EEE d MMM yyyy, HH:mm",
    time: "HH:mm",
    short: "EEE d MMM '·' HH:mm",
    day: "EEE d MMM",
    weekdayDate: "EEEE d MMM",
    dayHeading: "EEEE d MMMM",
  },
} satisfies Record<Locale, Record<string, string>>;

/** Berlin calendar date of an instant as "YYYY-MM-DD". */
export function toBerlinDateString(date: Date): string {
  return format(date, "yyyy-MM-dd", berlin);
}

/** Berlin time of an instant as "HH:mm", like START_TIME_SLOTS (to prefill a rematch, SPEC N-26). */
export function toBerlinTimeString(date: Date): string {
  return format(date, "HH:mm", berlin);
}

/** A Berlin calendar date, e.g. "22.10.2026" / "22 Oct 2026" (joined, team members). */
export function formatBerlinDate(date: Date, locale: Locale): string {
  return berlinFormat(date, FORMATS[locale].date, locale);
}

/**
 * " (Nacht auf Do, 22.10.)" / " (night of Wed to Thu 22 Oct)" for starts after midnight, so nobody
 * shows up a day late (SPEC P0-4). The day before is a Berlin calendar day, also across DST.
 */
function nightSuffix(startsAt: Date, locale: Locale): string {
  const hour = Number(format(startsAt, "H", berlin));
  if (hour > LAST_NIGHT_HOUR) return "";
  if (locale === "en") {
    const before = subDays(startsAt, 1, { in: tz(TIME_ZONE) });
    return ` (night of ${berlinFormat(before, "EEE", locale)} to ${berlinFormat(startsAt, "EEE d MMM", locale)})`;
  }
  return ` (Nacht auf ${berlinFormat(startsAt, "EEEEEE, dd.MM.", locale)})`;
}

/** A start time, e.g. "Do, 22.10.2026, 20:00 Uhr" / "Thu 22 Oct 2026, 20:00", with the night suffix. */
export function describeStart(startsAt: Date, locale: Locale): string {
  return berlinFormat(startsAt, FORMATS[locale].start, locale) + nightSuffix(startsAt, locale);
}

/** Time only, e.g. "20:00 Uhr" / "20:00", with the night suffix; for lists grouped by day. */
export function describeStartTime(startsAt: Date, locale: Locale): string {
  return berlinFormat(startsAt, FORMATS[locale].time, locale) + nightSuffix(startsAt, locale);
}

/** Compact start for lists, e.g. "Do 22.10. · 20:00" / "Thu 22 Oct · 20:00", with the night suffix. */
export function describeStartShort(startsAt: Date, locale: Locale): string {
  return berlinFormat(startsAt, FORMATS[locale].short, locale) + nightSuffix(startsAt, locale);
}

/** Day of the start only, e.g. "Do 22.10." / "Thu 22 Oct"; the time with describeStartTime. */
export function describeStartDay(startsAt: Date, locale: Locale): string {
  return berlinFormat(startsAt, FORMATS[locale].day, locale);
}

/** Weekday in Berlin, e.g. "Donnerstag" / "Thursday" (series, §5.27). */
export function formatBerlinWeekday(date: Date, locale: Locale): string {
  return berlinFormat(date, "EEEE", locale);
}

/** Weekday and date in Berlin, e.g. "Donnerstag, 22.10." / "Thursday 22 Oct". */
export function formatWeekdayDate(date: Date, locale: Locale): string {
  return berlinFormat(date, FORMATS[locale].weekdayDate, locale);
}

/** The current semester in Germany: winter from October to March, summer from April. */
export function semesterLabel(now: Date, locale: Locale): string {
  const year = Number(format(now, "yyyy", berlin));
  const month = Number(format(now, "M", berlin));
  const winter = locale === "en" ? "Winter" : "WiSe";
  const summer = locale === "en" ? "Summer" : "SoSe";
  if (month >= 10) return `${winter} ${year}/${String(year + 1).slice(2)}`;
  if (month <= 3) return `${winter} ${year - 1}/${String(year).slice(2)}`;
  return `${summer} ${year}`;
}

/** Heading of a Berlin calendar day, e.g. "Donnerstag, 22. Oktober" / "Thursday 22 October". */
export function formatDayHeading(date: Date, locale: Locale): string {
  return berlinFormat(date, FORMATS[locale].dayHeading, locale);
}
