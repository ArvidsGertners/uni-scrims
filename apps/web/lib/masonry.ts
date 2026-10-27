/** Gap between masonry cards in px, the `gap-3` of the grid (§5.32). */
export const MASONRY_GAP = 12;

/**
 * Number of 1 px grid rows a card of `height` px spans, including the gap below it, so cards in
 * one column never overlap (§5.32).
 */
export function masonryRowSpan(height: number, gap = MASONRY_GAP): number {
  return Math.max(1, Math.ceil(height + gap));
}
