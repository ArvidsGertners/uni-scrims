"use client";

import { cn } from "cn";
import { Children, type ReactNode, isValidElement, useEffect, useRef, useState } from "react";
import { CARD_COLUMNS } from "@/components/list-group";
import { masonryRowSpan } from "@/lib/masonry";

/**
 * Cards in CARD_COLUMNS that stack without gaps per column (§5.32): after measuring, the grid has
 * rows of 1 px and each cell spans its card's height plus the gap, so auto-placement puts each card
 * into the column that ends first. DOM order (keyboard, screen readers) stays row by row. Before
 * measuring and without JS, the plain grid with `items-start`.
 */
export function Masonry({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const keys = items.map((item, index) => (isValidElement(item) ? item.key : null) ?? `#${index}`);
  // Other cards after a soft navigation are other cells to observe.
  const cellKeys = keys.join("|");
  const containerRef = useRef<HTMLDivElement>(null);
  const [spans, setSpans] = useState<number[] | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cards = [...container.children].map((cell) => cell.firstElementChild as HTMLElement);
    // A card's height only depends on the column width, so layout and measuring never feed back.
    const measure = () => {
      const next = cards.map((card) => masonryRowSpan(card.getBoundingClientRect().height));
      setSpans((current) =>
        current?.length === next.length && current.every((span, index) => span === next[index])
          ? current
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [cellKeys]);

  return (
    <div
      ref={containerRef}
      className={cn(CARD_COLUMNS, spans ? "auto-rows-[1px] gap-x-3 gap-y-0" : "items-start gap-3")}
    >
      {items.map((item, index) => (
        <div
          key={keys[index]}
          style={spans?.[index] ? { gridRowEnd: `span ${spans[index]}` } : undefined}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
