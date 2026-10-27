"use client";

import { cn } from "cn";
import { Children, type ReactNode, isValidElement, useEffect, useRef, useState } from "react";
import { CARD_COLUMNS } from "@/components/list-group";
import { type MasonryPosition, masonryLayout } from "@/lib/masonry";

type Layout = { keys: string; positions: MasonryPosition[]; height: number; width: number };

/**
 * Cards in CARD_COLUMNS that stack without gaps per column (§5.32): after measuring, each card is
 * positioned absolutely in the column that ends first. Column count, width and gap come from the
 * grid's computed style, so the breakpoints stay those of CARD_COLUMNS; DOM order (keyboard, screen
 * readers) stays row by row. Before measuring and without JS, the plain grid with `items-start`.
 * `grid` replaces CARD_COLUMNS and its gap, e.g. for the notification categories (SPEC N-31).
 */
export function Masonry({ grid, children }: { grid?: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const keys = items.map((item, index) => (isValidElement(item) ? item.key : null) ?? `#${index}`);
  // Other cards after a soft navigation are other cells to measure.
  const cellKeys = keys.join("|");
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  // A layout of other cards never applies, e.g. right after "Zurücksetzen".
  const current = layout?.keys === cellKeys ? layout : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cells = [...container.children] as HTMLElement[];
    // A card's height only depends on the column width, so layout and measuring never feed back.
    const measure = () => {
      const style = getComputedStyle(container);
      const tracks = style.gridTemplateColumns.split(" ").filter(Boolean);
      const width = parseFloat(tracks[0] ?? "0");
      const gap = parseFloat(style.columnGap) || 0;
      const next = masonryLayout(
        cells.map((cell) => cell.offsetHeight),
        tracks.length,
        width,
        gap,
      );
      setLayout((previous) =>
        previous?.keys === cellKeys &&
        previous.width === width &&
        previous.height === next.height &&
        previous.positions.every(
          (position, index) =>
            position.x === next.positions[index]?.x && position.y === next.positions[index]?.y,
        )
          ? previous
          : { keys: cellKeys, width, ...next },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const cell of cells) observer.observe(cell);
    return () => observer.disconnect();
  }, [cellKeys]);

  return (
    <div
      ref={containerRef}
      className={cn(grid ?? cn(CARD_COLUMNS, "gap-3"), "relative items-start")}
      style={current ? { height: current.height } : undefined}
    >
      {items.map((item, index) => {
        const position = current?.positions[index];
        return (
          <div
            key={keys[index]}
            style={
              position
                ? { position: "absolute", left: position.x, top: position.y, width: current.width }
                : undefined
            }
          >
            {item}
          </div>
        );
      })}
    </div>
  );
}
