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

/**
 * German display of a start time, e.g. "Do, 22.10.2026, 20:00 Uhr". Starts after midnight get
 * "(Nacht auf Do, 22.10.)" so nobody shows up a day late (SPEC P0-4).
 */
export function describeStart(startsAt: Date): string {
  const text = format(startsAt, "EEEEEE, dd.MM.yyyy, HH:mm 'Uhr'", berlin);
  const hour = Number(format(startsAt, "H", berlin));
  if (hour > LAST_NIGHT_HOUR) return text;
  return `${text} (Nacht auf ${format(startsAt, "EEEEEE, dd.MM.", berlin)})`;
}
