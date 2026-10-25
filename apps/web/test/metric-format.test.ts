import { describe, expect, it } from "vitest";
import { formatCases, formatMetricValue, formatThreshold } from "../lib/metric-format.ts";

const HOUR = 60 * 60 * 1000;
/** Intl puts a no-break space before the percent sign. */
const pct = (text: string) => text.replace(" %", "\u00a0%");

describe("formatMetricValue", () => {
  it("rounds down, so a value never seems to cross the goal next to it", () => {
    // Reached "< 24 h", missed "≥ 50 %" and "≥ 4,0".
    expect(formatMetricValue("duration", 23.97 * HOUR, "de")).toBe("23,9 h");
    expect(formatMetricValue("rate", 0.49996, "de")).toBe(pct("49,9 %"));
    expect(formatMetricValue("rating", 3.98, "de")).toBe("3,9");
    expect(formatMetricValue("duration", 59.6 * 60_000, "de")).toBe("59 min");
  });

  it("shows values on the grid exactly, despite floating point noise", () => {
    expect(formatMetricValue("rate", 0.57, "de")).toBe(pct("57 %"));
    expect(formatMetricValue("rate", 0.95, "de")).toBe(pct("95 %"));
    expect(formatMetricValue("rate", 6 / 7, "de")).toBe(pct("85,7 %"));
    expect(formatMetricValue("rating", 4, "de")).toBe("4,0");
    expect(formatMetricValue("duration", 24 * HOUR, "de")).toBe("24 h");
    expect(formatMetricValue("count", 15, "de")).toBe("15");
  });
});

describe("formatThreshold and formatCases", () => {
  it("reads like the goals in SPEC §8", () => {
    expect(formatThreshold("duration", "below", 6 * HOUR, "de")).toBe("< 6 h");
    expect(formatThreshold("rate", "atLeast", 0.7, "de")).toBe(pct("≥ 70 %"));
    const result = { value: 1, cases: 1, reached: true, stretchReached: true };
    expect(formatCases("reviewTime", result, "de")).toBe("aus 1 Prüfung");
    expect(formatCases("readyTeams", { ...result, cases: 4 }, "de")).toBe("von 4 aktiven Teams");
  });
});

describe("English (§5.21)", () => {
  it("writes numbers and counts in English", () => {
    expect(formatMetricValue("duration", 23.97 * HOUR, "en")).toBe("23.9 h");
    expect(formatMetricValue("rate", 6 / 7, "en")).toBe("85.7%");
    expect(formatMetricValue("rating", 4, "en")).toBe("4.0");
    expect(formatThreshold("rate", "atLeast", 0.7, "en")).toBe("≥ 70%");
    const result = { value: 1, cases: 1, reached: true, stretchReached: true };
    expect(formatCases("reviewTime", result, "en")).toBe("from 1 review");
    expect(formatCases("readyTeams", { ...result, cases: 4 }, "en")).toBe("of 4 active teams");
  });
});
