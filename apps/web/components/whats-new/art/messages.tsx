"use client";

import * as m from "motion/react-m";
import { useArtMotion } from "./motion";

const LIVE = "LIVE";
const TYPING_DOTS = [42, 54, 66];

/**
 * Messages between teams (SPEC N-28): the two chevrons of the logo as the two teams' speech
 * bubbles, the left one light, the right one in the accent, meeting in the middle; a live badge and
 * the other team typing.
 */
export function MessagesArt() {
  const { reduce, draw, enter, fade, pop } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      {/* The own team: left, like the logo's light chevron. */}
      <m.g {...enter(0.15, -48)}>
        <rect
          x="22"
          y="28"
          width="156"
          height="46"
          rx="14"
          fill="var(--secondary)"
          stroke="var(--border-strong)"
        />
        <path d="M30 74 l-4 12 l16 -12 Z" fill="var(--secondary)" />
        <polyline
          points="38,41 49,51 38,61"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <m.line
          x1="62"
          y1="44"
          x2="160"
          y2="44"
          stroke="var(--muted-foreground)"
          strokeWidth="5"
          strokeLinecap="round"
          {...draw(0.55)}
        />
        <m.line
          x1="62"
          y1="58"
          x2="128"
          y2="58"
          stroke="var(--faint)"
          strokeWidth="5"
          strokeLinecap="round"
          {...draw(0.75)}
        />
      </m.g>

      {/* The other team: right, in the accent, pointing back. */}
      <m.g {...enter(1.0, 48)}>
        <rect
          x="142"
          y="92"
          width="156"
          height="46"
          rx="14"
          fill="var(--accent-soft)"
          stroke="var(--primary)"
        />
        <path d="M290 138 l4 12 l-16 -12 Z" fill="var(--accent-soft)" />
        <polyline
          points="282,105 271,115 282,125"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <m.line
          x1="160"
          y1="108"
          x2="258"
          y2="108"
          stroke="var(--accent-text)"
          strokeWidth="5"
          strokeLinecap="round"
          {...draw(1.4)}
        />
        <m.line
          x1="190"
          y1="122"
          x2="258"
          y2="122"
          stroke="var(--accent-text)"
          strokeOpacity="0.55"
          strokeWidth="5"
          strokeLinecap="round"
          {...draw(1.6)}
        />
      </m.g>

      {/* Live: both see it without reloading. */}
      <m.g {...pop(0.35)}>
        <rect x="236" y="26" width="62" height="24" rx="12" fill="var(--success-soft)" />
        <circle cx="251" cy="38" r="4" fill="var(--success)" />
        {reduce ? null : (
          <m.circle
            cx="251"
            cy="38"
            fill="none"
            stroke="var(--success)"
            strokeWidth="1.5"
            initial={{ r: 4, opacity: 0.8 }}
            animate={{ r: 11, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <text
          x="261"
          y="42"
          fontSize="11"
          fontWeight="700"
          fill="var(--success)"
          className="font-label"
        >
          {LIVE}
        </text>
      </m.g>

      {/* The own team writes again. */}
      <m.g {...fade(2.0)}>
        <rect
          x="22"
          y="144"
          width="62"
          height="26"
          rx="13"
          fill="var(--secondary)"
          stroke="var(--border-strong)"
        />
        {TYPING_DOTS.map((cx, i) =>
          reduce ? (
            <circle key={cx} cx={cx} cy="157" r="3.5" fill="var(--muted-foreground)" />
          ) : (
            <m.circle
              key={cx}
              cx={cx}
              cy="157"
              r="3.5"
              fill="var(--muted-foreground)"
              animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1, repeat: Infinity, delay: 2.1 + i * 0.16 }}
            />
          ),
        )}
      </m.g>
    </svg>
  );
}
