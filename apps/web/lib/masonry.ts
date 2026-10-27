/** Position of a card in the masonry list, in px from the top left of the list. */
export type MasonryPosition = { x: number; y: number };

/**
 * Places cards of the given heights one after another into the column that ends first (ties: the
 * leftmost), so the first row stays in order (§5.32). Returns each card's position and the height
 * of the list.
 */
export function masonryLayout(
  heights: readonly number[],
  columns: number,
  columnWidth: number,
  gap: number,
): { positions: MasonryPosition[]; height: number } {
  const ends = Array<number>(Math.max(1, columns)).fill(0);
  const positions = heights.map((height) => {
    const column = ends.indexOf(Math.min(...ends));
    const y = ends[column]!;
    ends[column] = y + height + gap;
    return { x: column * (columnWidth + gap), y };
  });
  return { positions, height: Math.max(0, Math.max(...ends) - gap) };
}
