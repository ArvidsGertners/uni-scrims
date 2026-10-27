"use client";

import * as m from "motion/react-m";
import { useArtMotion } from "./motion";

/** A team's shield, centred on 0,0. */
const SHIELD = "M0 -40 L32 -28 V2 C32 26 16 38 0 46 C-16 38 -32 26 -32 2 V-28 Z";
/** The request flies from the left team to the right one on this curve. */
const CURVE = "M100 64 Q160 14 220 64";
const CURVE_X = [100, 115, 130, 145, 160, 175, 190, 205, 220];
const CURVE_Y = [64, 53.1, 45.2, 40.6, 39, 40.6, 45.2, 53.1, 64];
/** Seven weeks of a fixed partnership around a ring. */
const WEEKS = [
  [160, 104],
  [180.3, 113.8],
  [185.3, 135.8],
  [171.3, 153.4],
  [148.7, 153.4],
  [134.7, 135.8],
  [139.7, 113.8],
] as const;

/**
 * Direct requests and fixed partners (SPEC N-26): one team asks another directly, past the board;
 * the request flies over, and accepted weekly it closes into a ring of dates.
 */
export function DirectRequestsArt() {
  const { reduce, draw, enter, pop } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <g transform="translate(62 92)">
        <m.g {...enter(0.1, -36)}>
          <path d={SHIELD} fill="var(--secondary)" stroke="var(--border-strong)" strokeWidth="2" />
          <polyline
            points="-10,-14 6,2 -10,18"
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.g>
      </g>
      <g transform="translate(258 92)">
        <m.g {...enter(0.25, 36)}>
          <path d={SHIELD} fill="var(--accent-soft)" stroke="var(--primary)" strokeWidth="2" />
          <polyline
            points="10,-14 -6,2 10,18"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </m.g>
      </g>

      <m.path
        d={CURVE}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeDasharray="1 7"
        strokeLinecap="round"
        {...draw(0.6, 0.9)}
      />
      {reduce ? (
        <circle cx="220" cy="64" r="5" fill="var(--primary)" />
      ) : (
        <m.circle
          r="5"
          fill="var(--primary)"
          initial={{ cx: 100, cy: 64, opacity: 0 }}
          animate={{ cx: CURVE_X, cy: CURVE_Y, opacity: [0, 1, 1, 1, 1, 1, 1, 1, 0] }}
          transition={{
            delay: 1.1,
            duration: 1.1,
            ease: "easeInOut",
            repeat: Infinity,
            repeatDelay: 1.6,
          }}
        />
      )}

      {/* Accepted weekly: every date books itself. */}
      <m.circle
        cx="160"
        cy="130"
        r="26"
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth="2"
        {...draw(1.5, 0.8)}
      />
      {WEEKS.map(([cx, cy], i) => (
        <m.circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="4.5"
          fill="var(--primary)"
          stroke="var(--card)"
          strokeWidth="2"
          {...pop(1.9 + i * 0.12)}
        />
      ))}
      <m.polyline
        points="150,130 157,137 171,122"
        fill="none"
        stroke="var(--success)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw(2.8, 0.4)}
      />
    </svg>
  );
}
