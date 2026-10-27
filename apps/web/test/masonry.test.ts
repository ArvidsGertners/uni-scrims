// Row spans of the masonry team list (ARCHITECTURE §5.32).
import { describe, expect, it } from "vitest";
import { MASONRY_GAP, masonryRowSpan } from "../lib/masonry.ts";

describe("masonryRowSpan", () => {
  it("spans the card height plus the gap, rounded up", () => {
    expect(masonryRowSpan(200)).toBe(200 + MASONRY_GAP);
    expect(masonryRowSpan(200.2)).toBe(201 + MASONRY_GAP);
    expect(masonryRowSpan(100, 0)).toBe(100);
  });

  it("spans at least one row", () => {
    expect(masonryRowSpan(0, 0)).toBe(1);
  });
});
