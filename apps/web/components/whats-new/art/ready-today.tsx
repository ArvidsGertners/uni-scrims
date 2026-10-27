"use client";

import * as m from "motion/react-m";
import { useArtMotion } from "./motion";

// The scrim evening from 10:00 to 02:00 on a line, 17 px per hour (SPEC N-27).
const LEFT = 24;
const HOUR = 17;
const at = (hours: number) => LEFT + hours * HOUR;
const TICKS = [
  { hours: 0, label: "10" },
  { hours: 4, label: "14" },
  { hours: 8, label: "18" },
  { hours: 12, label: "22" },
  { hours: 16, label: "02" },
];
// A window from 19:00 to 22:30, start times every 15 minutes.
const FROM = at(9);
const TO = at(12.5);
const STARTS = Array.from({ length: 15 }, (_, i) => FROM + (i * (TO - FROM)) / 14);
const WINDOW = "19:00 – 22:30";

/**
 * "Heute spielbereit" (SPEC N-27): a bolt strikes the evening's timeline, the window fills in, and
 * its start times light up one after another, as other teams pick one.
 */
export function ReadyTodayArt() {
  const { reduce, draw, enter, fade } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      <m.line
        x1={LEFT}
        y1="128"
        x2={at(16)}
        y2="128"
        stroke="var(--border-strong)"
        strokeWidth="2"
        strokeDasharray="2 6"
        strokeLinecap="round"
        {...draw(0.05, 0.8)}
      />
      {TICKS.map((tick, i) => (
        <m.g key={tick.label} {...fade(0.2 + i * 0.08)}>
          <line
            x1={at(tick.hours)}
            y1="122"
            x2={at(tick.hours)}
            y2="134"
            stroke="var(--border-strong)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <text
            x={at(tick.hours)}
            y="154"
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted-foreground)"
            className="font-label"
          >
            {tick.label}
          </text>
        </m.g>
      ))}

      {/* The window fills from its first start time. */}
      <m.rect
        x={FROM}
        y="116"
        width={TO - FROM}
        height="24"
        rx="8"
        fill="var(--accent-soft)"
        stroke="var(--primary)"
        strokeWidth="2"
        style={{ originX: 0 }}
        {...(reduce
          ? {}
          : {
              initial: { scaleX: 0, opacity: 0 },
              animate: { scaleX: 1, opacity: 1 },
              transition: { delay: 0.85, duration: 0.7, ease: [0.2, 0.9, 0.2, 1] as const },
            })}
      />
      {STARTS.map((cx, i) =>
        reduce ? (
          <circle key={cx} cx={cx} cy="128" r="2" fill="var(--primary)" />
        ) : (
          <m.circle
            key={cx}
            cx={cx}
            cy="128"
            r="2"
            fill="var(--primary)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{
              delay: 1.5 + i * 0.09,
              duration: 1.4,
              repeat: Infinity,
              repeatDelay: 0.3,
            }}
          />
        ),
      )}
      <m.text
        x={(FROM + TO) / 2}
        y="174"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--accent-text)"
        className="font-label"
        {...fade(1.3)}
      >
        {WINDOW}
      </m.text>

      {/* The bolt of the button "Heute spielbereit". */}
      <m.g {...enter(0.3, 0, -36)}>
        <path
          d="M230 16 L198 62 H216 L204 104 L242 50 H222 Z"
          fill="var(--primary)"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </m.g>
      {reduce ? null : (
        <m.circle
          cx="205"
          cy="116"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          initial={{ r: 0, opacity: 0 }}
          animate={{ r: [0, 42], opacity: [0.7, 0] }}
          transition={{ delay: 0.75, duration: 0.8, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}
