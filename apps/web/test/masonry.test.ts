// Layout of the masonry team list (ARCHITECTURE §5.32).
import { describe, expect, it } from "vitest";
import { masonryLayout } from "../lib/masonry.ts";

describe("masonryLayout", () => {
  it("fills the first row in order, then the column that ends first", () => {
    const { positions, height } = masonryLayout([100, 50, 80, 30, 40], 3, 200, 10);
    expect(positions).toEqual([
      { x: 0, y: 0 },
      { x: 210, y: 0 },
      { x: 420, y: 0 },
      { x: 210, y: 60 },
      { x: 420, y: 90 },
    ]);
    expect(height).toBe(130);
  });

  it("takes the leftmost of equally short columns", () => {
    const { positions } = masonryLayout([50, 50, 20], 2, 100, 12);
    expect(positions[2]).toEqual({ x: 0, y: 62 });
  });

  it("stacks everything in one column", () => {
    const { positions, height } = masonryLayout([10, 20, 30], 1, 300, 12);
    expect(positions.map((position) => position.y)).toEqual([0, 22, 54]);
    expect(height).toBe(84);
  });

  it("handles an empty list", () => {
    expect(masonryLayout([], 3, 100, 12)).toEqual({ positions: [], height: 0 });
  });
});
