// Time constants (ARCHITECTURE §3). Durations in milliseconds.
// DEV_TIME_OFFSETS=true shortens them to minutes for manual tests, only with NODE_ENV=development (§7).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Timing = {
  /** Feedback prompt is sent and feedback window opens this long after startsAt. */
  FEEDBACK_OFFSET: number;
  /** Feedback deadline = feedbackOpensAt + FEEDBACK_WINDOW. */
  FEEDBACK_WINDOW: number;
  /** Reminders before startsAt: [24 h, 1 h]. */
  REMINDER_OFFSETS: readonly [number, number];
  /** Cancellations closer to startsAt than this count as late. */
  LATE_CANCEL: number;
  /** Pending verifications older than this are auto-rejected. */
  VERIFICATION_TTL: number;
  /** Minimum lead time between now and a request's startsAt. */
  MIN_REQUEST_LEAD: number;
};

export const PRODUCTION_TIMING: Timing = {
  FEEDBACK_OFFSET: 3 * HOUR,
  FEEDBACK_WINDOW: 72 * HOUR,
  REMINDER_OFFSETS: [24 * HOUR, 1 * HOUR],
  LATE_CANCEL: 24 * HOUR,
  VERIFICATION_TTL: 14 * DAY,
  MIN_REQUEST_LEAD: 30 * MINUTE,
};

export const DEV_TIMING: Timing = {
  FEEDBACK_OFFSET: 2 * MINUTE,
  FEEDBACK_WINDOW: 5 * MINUTE,
  REMINDER_OFFSETS: [3 * MINUTE, 1 * MINUTE],
  LATE_CANCEL: 24 * HOUR,
  VERIFICATION_TTL: 10 * MINUTE,
  MIN_REQUEST_LEAD: 5 * MINUTE,
};

type TimingEnv = { NODE_ENV?: string; DEV_TIME_OFFSETS?: string };

export function getTiming(env: TimingEnv): Timing {
  const devOffsets = env.NODE_ENV === "development" && env.DEV_TIME_OFFSETS === "true";
  return devOffsets ? DEV_TIMING : PRODUCTION_TIMING;
}

export const TIMING: Timing = getTiming(process.env);
