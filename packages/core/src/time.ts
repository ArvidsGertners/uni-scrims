// Start times of requests in Europe/Berlin (SPEC P0-4, ARCHITECTURE §5.3).
// Input is a Berlin calendar date and wall-clock time; core converts to UTC. No time logic in the browser.
import { TZDate, tz } from "@date-fns/tz";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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

/** Berlin calendar date of an instant as "YYYY-MM-DD". */
export function toBerlinDateString(date: Date): string {
  return format(date, "yyyy-MM-dd", berlin);
}

/** German display of a Berlin calendar date, e.g. "22.10.2026" (joined, team members). */
export function formatBerlinDate(date: Date): string {
  return format(date, "dd.MM.yyyy", berlin);
}

/** " (Nacht auf Do, 22.10.)" for starts after midnight, so nobody shows up a day late (SPEC P0-4). */
function nightSuffix(startsAt: Date): string {
  const hour = Number(format(startsAt, "H", berlin));
  if (hour > LAST_NIGHT_HOUR) return "";
  return ` (Nacht auf ${format(startsAt, "EEEEEE, dd.MM.", berlin)})`;
}

/** German display of a start time, e.g. "Do, 22.10.2026, 20:00 Uhr", with the night suffix. */
export function describeStart(startsAt: Date): string {
  return format(startsAt, "EEEEEE, dd.MM.yyyy, HH:mm 'Uhr'", berlin) + nightSuffix(startsAt);
}

/** Time only, e.g. "20:00 Uhr", with the night suffix; for lists grouped by day. */
export function describeStartTime(startsAt: Date): string {
  return format(startsAt, "HH:mm 'Uhr'", berlin) + nightSuffix(startsAt);
}

/** Compact start for lists, e.g. "Do 22.10. · 20:00", with the night suffix. */
export function describeStartShort(startsAt: Date): string {
  return format(startsAt, "EEEEEE dd.MM. '·' HH:mm", berlin) + nightSuffix(startsAt);
}

/** Day of the start only, e.g. "Do 22.10."; the time with describeStartTime (team page tile). */
export function describeStartDay(startsAt: Date): string {
  return format(startsAt, "EEEEEE dd.MM.", berlin);
}

/** Weekday and date in Berlin, e.g. "Donnerstag, 22.10.". */
export function formatWeekdayDate(date: Date): string {
  return format(date, "EEEE, dd.MM.", berlin);
}

/** The current semester in Germany: winter from October to March, summer from April. */
export function semesterLabel(now: Date): string {
  const year = Number(format(now, "yyyy", berlin));
  const month = Number(format(now, "M", berlin));
  if (month >= 10) return `WiSe ${year}/${String(year + 1).slice(2)}`;
  if (month <= 3) return `WiSe ${year - 1}/${String(year).slice(2)}`;
  return `SoSe ${year}`;
}

/** Heading of a Berlin calendar day, e.g. "Donnerstag, 22. Oktober". */
export function formatDayHeading(date: Date): string {
  return format(date, "EEEE, d. MMMM", berlin);
}
