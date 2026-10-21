import { describe, expect, it } from "vitest";
import { DEV_TIMING, PRODUCTION_TIMING, getTiming } from "../config/timing.ts";

const HOUR = 60 * 60 * 1000;

describe("getTiming", () => {
  it("uses production values by default", () => {
    const timing = getTiming({});
    expect(timing).toBe(PRODUCTION_TIMING);
    expect(timing.FEEDBACK_OFFSET).toBe(3 * HOUR);
    expect(timing.FEEDBACK_WINDOW).toBe(72 * HOUR);
    expect(timing.REMINDER_OFFSETS).toEqual([24 * HOUR, HOUR]);
    expect(timing.LATE_CANCEL).toBe(24 * HOUR);
    expect(timing.VERIFICATION_TTL).toBe(14 * 24 * HOUR);
  });

  it("shortens times with DEV_TIME_OFFSETS in development", () => {
    expect(getTiming({ NODE_ENV: "development", DEV_TIME_OFFSETS: "true" })).toBe(DEV_TIMING);
  });

  it("ignores DEV_TIME_OFFSETS outside development", () => {
    expect(getTiming({ NODE_ENV: "production", DEV_TIME_OFFSETS: "true" })).toBe(PRODUCTION_TIMING);
    expect(getTiming({ NODE_ENV: "test", DEV_TIME_OFFSETS: "true" })).toBe(PRODUCTION_TIMING);
  });

  it("ignores DEV_TIME_OFFSETS=false in development", () => {
    expect(getTiming({ NODE_ENV: "development", DEV_TIME_OFFSETS: "false" })).toBe(
      PRODUCTION_TIMING,
    );
  });
});
