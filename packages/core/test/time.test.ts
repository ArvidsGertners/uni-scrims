import { describe, expect, it } from "vitest";
import {
  START_TIME_SLOTS,
  addBerlinWeeks,
  berlinDayRange,
  berlinToUtc,
  describeStart,
  describeStartDay,
  describeStartShort,
  describeStartTime,
  daysBetweenDates,
  formatBerlinDate,
  formatBerlinWeekday,
  formatDayHeading,
  formatWeekdayDate,
  isStartSlot,
  isValidDateString,
  semesterLabel,
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

describe("weeks and days for series (§5.27)", () => {
  it("adds calendar weeks in Berlin, keeping the time across DST changes", () => {
    // 20:00 CEST → 20:00 CET (end of summer time on 25.10.2026) and back on 28.03.2027.
    expect(addBerlinWeeks(new Date("2026-10-22T18:00:00Z"), 1)).toEqual(
      new Date("2026-10-29T19:00:00Z"),
    );
    expect(addBerlinWeeks(new Date("2027-03-25T19:00:00Z"), 1)).toEqual(
      new Date("2027-04-01T18:00:00Z"),
    );
    expect(addBerlinWeeks(new Date("2026-10-29T19:00:00Z"), -1)).toEqual(
      new Date("2026-10-22T18:00:00Z"),
    );
    // 01:00 after midnight stays 01:00.
    expect(addBerlinWeeks(new Date("2026-10-22T23:00:00Z"), 1)).toEqual(
      new Date("2026-10-30T00:00:00Z"),
    );
  });

  it("counts calendar days between dates", () => {
    expect(daysBetweenDates("2026-10-22", "2026-10-29")).toBe(7);
    expect(daysBetweenDates("2026-10-22", "2027-02-11")).toBe(112);
    expect(daysBetweenDates("2026-10-29", "2026-10-22")).toBe(-7);
    expect(daysBetweenDates("2027-03-25", "2027-04-01")).toBe(7);
  });

  it("names the weekday in Berlin", () => {
    // 23:30 UTC on Thursday is already Friday in Berlin.
    expect(formatBerlinWeekday(new Date("2026-10-22T23:30:00Z"), "de")).toBe("Freitag");
    expect(formatBerlinWeekday(new Date("2026-10-22T18:00:00Z"), "en")).toBe("Thursday");
  });
});

describe("describeStart", () => {
  it("shows date and time in Berlin", () => {
    expect(describeStart(new Date("2026-10-22T18:00:00Z"), "de")).toBe("Do, 22.10.2026, 20:00 Uhr");
  });

  it("marks starts after midnight as night", () => {
    expect(describeStart(new Date("2026-10-21T23:00:00Z"), "de")).toBe(
      "Do, 22.10.2026, 01:00 Uhr (Nacht auf Do, 22.10.)",
    );
  });
});

describe("describeStartTime", () => {
  it("shows the time in Berlin", () => {
    expect(describeStartTime(new Date("2026-10-22T18:00:00Z"), "de")).toBe("20:00 Uhr");
  });

  it("marks starts after midnight as night", () => {
    expect(describeStartTime(new Date("2026-10-21T23:00:00Z"), "de")).toBe(
      "01:00 Uhr (Nacht auf Do, 22.10.)",
    );
  });
});

describe("formatDayHeading", () => {
  it("names the Berlin calendar day", () => {
    expect(formatDayHeading(new Date("2026-10-29T23:30:00Z"), "de")).toBe("Freitag, 30. Oktober");
    expect(formatDayHeading(new Date("2026-11-01T12:00:00Z"), "de")).toBe("Sonntag, 1. November");
  });
});

describe("formatWeekdayDate", () => {
  it("names weekday and date in Berlin", () => {
    expect(formatWeekdayDate(new Date("2026-10-29T23:30:00Z"), "de")).toBe("Freitag, 30.10.");
  });
});

describe("formatBerlinDate", () => {
  it("is the Berlin calendar date with the year", () => {
    expect(formatBerlinDate(new Date("2026-10-22T18:00:00Z"), "de")).toBe("22.10.2026");
    // 00:30 Berlin time on New Year's Day.
    expect(formatBerlinDate(new Date("2026-12-31T23:30:00Z"), "de")).toBe("01.01.2027");
  });
});

describe("describeStartDay", () => {
  it("is the Berlin calendar day of the start, also after midnight", () => {
    expect(describeStartDay(new Date("2026-10-22T18:00:00Z"), "de")).toBe("Do 22.10.");
    // 00:30 Berlin time on Friday.
    expect(describeStartDay(new Date("2026-10-22T22:30:00Z"), "de")).toBe("Fr 23.10.");
  });
});

describe("describeStartShort", () => {
  it("shows weekday, date and time in Berlin, with the night suffix", () => {
    expect(describeStartShort(new Date("2026-10-22T18:00:00Z"), "de")).toBe("Do 22.10. · 20:00");
    expect(describeStartShort(new Date("2026-10-21T23:00:00Z"), "de")).toBe(
      "Do 22.10. · 01:00 (Nacht auf Do, 22.10.)",
    );
  });
});

describe("semesterLabel", () => {
  it("names winter and summer semesters", () => {
    expect(semesterLabel(new Date("2026-10-23T12:00:00Z"), "de")).toBe("WiSe 2026/27");
    expect(semesterLabel(new Date("2027-03-31T12:00:00Z"), "de")).toBe("WiSe 2026/27");
    expect(semesterLabel(new Date("2027-04-01T12:00:00Z"), "de")).toBe("SoSe 2027");
    // Berlin time: 1 October already starts at 22:00 UTC the day before.
    expect(semesterLabel(new Date("2027-09-30T22:30:00Z"), "de")).toBe("WiSe 2027/28");
  });
});

describe("English formats (§5.21)", () => {
  it("shows starts day first with the 24-hour clock, in Berlin time", () => {
    expect(describeStart(new Date("2026-10-22T18:00:00Z"), "en")).toBe("Thu 22 Oct 2026, 20:00");
    expect(describeStartTime(new Date("2026-10-22T18:00:00Z"), "en")).toBe("20:00");
    expect(describeStartShort(new Date("2026-10-22T18:00:00Z"), "en")).toBe("Thu 22 Oct · 20:00");
    expect(describeStartDay(new Date("2026-10-22T22:30:00Z"), "en")).toBe("Fri 23 Oct");
  });

  it("names the night with the day before", () => {
    expect(describeStart(new Date("2026-10-21T23:00:00Z"), "en")).toBe(
      "Thu 22 Oct 2026, 01:00 (night of Wed to Thu 22 Oct)",
    );
    expect(describeStartTime(new Date("2026-10-21T23:00:00Z"), "en")).toBe(
      "01:00 (night of Wed to Thu 22 Oct)",
    );
  });

  it("takes the day before in the Berlin calendar, also around the clock changes", () => {
    // 00:30 summer time on the Monday after the change in March.
    expect(describeStartShort(new Date("2026-03-29T22:30:00Z"), "en")).toBe(
      "Mon 30 Mar · 00:30 (night of Sun to Mon 30 Mar)",
    );
    // 01:00 winter time on the day of the change in March, before 02:00.
    expect(describeStartShort(new Date("2026-03-29T00:00:00Z"), "en")).toBe(
      "Sun 29 Mar · 01:00 (night of Sat to Sun 29 Mar)",
    );
    // 00:30 winter time on the Monday after the change in October.
    expect(describeStartShort(new Date("2026-10-25T23:30:00Z"), "en")).toBe(
      "Mon 26 Oct · 00:30 (night of Sun to Mon 26 Oct)",
    );
  });

  it("writes dates and headings without numeric months", () => {
    expect(formatDayHeading(new Date("2026-10-29T23:30:00Z"), "en")).toBe("Friday 30 October");
    expect(formatWeekdayDate(new Date("2026-10-29T23:30:00Z"), "en")).toBe("Friday 30 Oct");
    expect(formatBerlinDate(new Date("2026-10-22T18:00:00Z"), "en")).toBe("22 Oct 2026");
    expect(formatBerlinDate(new Date("2026-12-31T23:30:00Z"), "en")).toBe("1 Jan 2027");
  });

  it("names the semesters", () => {
    expect(semesterLabel(new Date("2026-10-23T12:00:00Z"), "en")).toBe("Winter 2026/27");
    expect(semesterLabel(new Date("2027-04-01T12:00:00Z"), "en")).toBe("Summer 2027");
  });
});
