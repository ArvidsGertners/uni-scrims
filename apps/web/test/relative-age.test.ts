// How long ago a bell entry arrived (§5.34).
import { describe, expect, it } from "vitest";
import { relativeAge } from "../lib/relative-age.ts";

const NOW = new Date("2026-10-27T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;

describe("relativeAge", () => {
  it("counts whole minutes, hours and days", () => {
    expect(relativeAge(ago(59_999), NOW)).toEqual({ unit: "now" });
    expect(relativeAge(ago(MINUTE), NOW)).toEqual({ unit: "minutes", value: 1 });
    expect(relativeAge(ago(59 * MINUTE + 59_999), NOW)).toEqual({ unit: "minutes", value: 59 });
    expect(relativeAge(ago(60 * MINUTE), NOW)).toEqual({ unit: "hours", value: 1 });
    expect(relativeAge(ago(24 * 60 * MINUTE - 1), NOW)).toEqual({ unit: "hours", value: 23 });
    expect(relativeAge(ago(3 * 24 * 60 * MINUTE), NOW)).toEqual({ unit: "days", value: 3 });
  });

  it("shows a time slightly in the future (clock skew) as now", () => {
    expect(relativeAge(new Date(NOW.getTime() + 5000), NOW)).toEqual({ unit: "now" });
  });
});
