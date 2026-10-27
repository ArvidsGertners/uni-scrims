"use client";

import * as m from "motion/react-m";
import { useArtMotion } from "./motion";

// A month of seven columns; the same weekday lights up week after week (SPEC N-25).
const CELL = 22;
const GAP = 8;
const LEFT = 59;
const TOP = 56;
const COLUMNS = 7;
const ROWS = 4;
const DAY = 3;
const x = (column: number) => LEFT + column * (CELL + GAP);
const y = (row: number) => TOP + row * (CELL + 4);
const CELLS = Array.from({ length: ROWS * COLUMNS }, (_, i) => ({
  row: Math.floor(i / COLUMNS),
  column: i % COLUMNS,
}));

/**
 * Weekly requests (SPEC N-25): one request, and the same weekday fills in week after week, while
 * the repeat arrow keeps turning.
 */
export function WeeklyRequestsArt() {
  const { reduce, draw, enter, fade, pop } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <m.g {...enter(0.05, 0, 18)}>
        <rect
          x="40"
          y="20"
          width="240"
          height="146"
          rx="14"
          fill="var(--secondary)"
          stroke="var(--border-strong)"
        />
        <line x1="40" y1="46" x2="280" y2="46" stroke="var(--border-strong)" />
        <circle
          cx="74"
          cy="20"
          r="4"
          fill="var(--card)"
          stroke="var(--border-strong)"
          strokeWidth="2"
        />
        <circle
          cx="246"
          cy="20"
          r="4"
          fill="var(--card)"
          stroke="var(--border-strong)"
          strokeWidth="2"
        />
        <rect x="56" y="29" width="54" height="8" rx="4" fill="var(--faint)" />
      </m.g>
      {CELLS.map(({ row, column }) => (
        <m.rect
          key={`${row}-${column}`}
          x={x(column)}
          y={y(row)}
          width={CELL}
          height={CELL}
          rx="5"
          fill="var(--card)"
          stroke="var(--border)"
          {...fade(0.25 + (row * COLUMNS + column) * 0.012, 0.3)}
        />
      ))}
      {/* The weekday: the first date, then every week by itself. */}
      <m.line
        x1={x(DAY) + CELL / 2}
        y1={y(0) + CELL}
        x2={x(DAY) + CELL / 2}
        y2={y(ROWS - 1)}
        stroke="var(--primary)"
        strokeWidth="2"
        strokeDasharray="2 4"
        {...draw(0.9, 1.4)}
      />
      {Array.from({ length: ROWS }, (_, row) => (
        <g key={row} transform={`translate(${x(DAY) + CELL / 2} ${y(row) + CELL / 2})`}>
          <m.g {...pop(0.8 + row * 0.38)}>
            <rect
              x={-CELL / 2}
              y={-CELL / 2}
              width={CELL}
              height={CELL}
              rx="5"
              fill="var(--primary)"
            />
            <polyline
              points="-3,-5 3,0 -3,5"
              fill="none"
              stroke="var(--primary-foreground)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </m.g>
        </g>
      ))}

      {/* The repeat arrow at the corner. */}
      <g transform="translate(272 30)">
        <m.g {...pop(0.5)}>
          <circle r="20" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />
          <m.g
            {...(reduce
              ? {}
              : {
                  animate: { rotate: 360 },
                  transition: { duration: 6, repeat: Infinity, ease: "linear" as const },
                })}
          >
            <path
              d="M-9 -3 A9.5 9.5 0 0 1 8 -4"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polyline
              points="3,-9 8,-4 2,0"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9 3 A9.5 9.5 0 0 1 -8 4"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polyline
              points="-3,9 -8,4 -2,0"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </m.g>
        </m.g>
      </g>
    </svg>
  );
}
