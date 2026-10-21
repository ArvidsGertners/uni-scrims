import { describe, expect, it } from "vitest";
import {
  START_TIME_SLOTS,
  berlinDayRange,
  berlinToUtc,
  describeStart,
  isStartSlot,
  isValidDateString,
  toBerlinDateString,
} from "../src/index.ts";

describe("start time slots", () => {
  it("covers 10:00 to 01:45 in 15-minute steps", () => {
    expect(START_TIME_SLOTS[0]).toBe("10:00");
    expect(START_TIME_SLOTS.at(-1)).toBe("01:45");
    expect(START_TIME_SLOTS).toHaveLength(14 * 4 + 2 * 4);
    expect(isStartSlot("23:45")).toBe(true);
    expect(isStartSlot("00:00")).toBe(true);
  });

  it("rejects times outside the window or grid", () => {
    for (const time of ["09:45", "02:00", "20:10", "2:00", "24:00"]) {
      expect(isStartSlot(time)).toBe(false);
    }
  });
});

describe("berlinToUtc", () => {
  it("converts summer and winter time", () => {
    expect(berlinToUtc("2026-07-01", "20:00")).toEqual(new Date("2026-07-01T18:00:00Z"));
    expect(berlinToUtc("2026-12-01", "20:00")).toEqual(new Date("2026-12-01T19:00:00Z"));
  });

  it("uses the calendar date of the actual start for night slots", () => {
    // 01:00 on 22.10. is the night from Wednesday to Thursday.
    expect(berlinToUtc("2026-10-22", "01:00")).toEqual(new Date("2026-10-21T23:00:00Z"));
  });

  it("handles the days around the DST switch", () => {
    // DST ends on 25.10.2026 at 03:00; the slots avoid 02:00–03:00.
    expect(berlinToUtc("2026-10-25", "01:45")).toEqual(new Date("2026-10-24T23:45:00Z"));
    expect(berlinToUtc("2026-10-25", "10:00")).toEqual(new Date("2026-10-25T09:00:00Z"));
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidDateString("2026-10-22")).toBe(true);
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("22.10.2026")).toBe(false);
  });

  it("computes the UTC range of a Berlin day", () => {
    expect(berlinDayRange("2026-10-25")).toEqual({
      from: new Date("2026-10-24T22:00:00Z"),
      to: new Date("2026-10-25T23:00:00Z"),
    });
  });

  it("formats the Berlin date", () => {
    expect(toBerlinDateString(new Date("2026-10-21T23:00:00Z"))).toBe("2026-10-22");
  });
});

describe("describeStart", () => {
  it("shows date and time in Berlin", () => {
    expect(describeStart(new Date("2026-10-22T18:00:00Z"))).toBe("Do, 22.10.2026, 20:00 Uhr");
  });

  it("marks starts after midnight as night", () => {
    expect(describeStart(new Date("2026-10-21T23:00:00Z"))).toBe(
      "Do, 22.10.2026, 01:00 Uhr (Nacht auf Do, 22.10.)",
    );
  });
});
