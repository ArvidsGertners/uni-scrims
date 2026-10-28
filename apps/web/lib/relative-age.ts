// How long ago something happened, for the bell (§5.34); the words come from the dictionary.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type RelativeAge = { unit: "now" } | { unit: "minutes" | "hours" | "days"; value: number };

/** Under a minute "now", then whole minutes, hours and days (rounded down). */
export function relativeAge(then: Date, now: Date): RelativeAge {
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed < MINUTE) return { unit: "now" };
  if (elapsed < HOUR) return { unit: "minutes", value: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: "hours", value: Math.floor(elapsed / HOUR) };
  return { unit: "days", value: Math.floor(elapsed / DAY) };
}
