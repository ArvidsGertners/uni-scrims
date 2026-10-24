// The chosen design on <html> and in the browser's toolbar (ARCHITECTURE §5.16).
import { describe, expect, it } from "vitest";
import { themeAttribute, themeColor } from "../lib/theme.ts";

describe("themeAttribute", () => {
  it("sets data-theme only for a fixed choice", () => {
    expect(themeAttribute("LIGHT")).toBe("light");
    expect(themeAttribute("DARK")).toBe("dark");
    expect(themeAttribute("SYSTEM")).toBeUndefined();
    expect(themeAttribute(undefined)).toBeUndefined();
  });
});

describe("themeColor", () => {
  it("gives the colour of the chosen mode, or both by the system setting", () => {
    expect(themeColor("LIGHT")).toBe("#f5f6f8");
    expect(themeColor("DARK")).toBe("#0b0c0e");
    expect(themeColor(undefined)).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
      { media: "(prefers-color-scheme: dark)", color: "#0b0c0e" },
    ]);
  });
});
