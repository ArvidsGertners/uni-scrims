"use client";

import * as m from "motion/react-m";
import { SNAP_EASE, useArtMotion } from "./motion";

/** The bell, centred on 0,0 with the clapper below. */
const BELL = "M0 -36 C-19 -36 -28 -21 -28 -4 V12 L-36 24 H36 L28 12 V-4 C28 -21 19 -36 0 -36 Z";
/** The entries arrive at these times; the first one is read at READ_AT. */
const ARRIVALS = [0.9, 1.4, 1.9] as const;
const READ_AT = 3.0;
/** The badge's number over time: one per arrival, one less once the first entry is read. */
const COUNTS = [
  [1, ARRIVALS[0]],
  [2, ARRIVALS[1]],
  [3, ARRIVALS[2]],
  [2, READ_AT],
] as const;
/** Line widths of the three entries: title and text. */
const ROWS = [
  { y: 52, title: 64, text: 44, glyph: "check" },
  { y: 86, title: 52, text: 58, glyph: "bubble" },
  { y: 120, title: 70, text: 38, glyph: "chevron" },
] as const;

/**
 * The notification bell (SPEC N-32): the bell swings, entries slide into its list one by one and
 * the badge counts up; a pointer reads the first one and the badge counts down again.
 */
export function BellArt() {
  const { reduce, draw, enter } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      {/* Sound waves around the bell. */}
      <g fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round">
        <m.path d="M40 70 Q32 88 40 106" {...draw(0.7, 0.5)} />
        <m.path d="M28 62 Q16 88 28 114" opacity="0.5" {...draw(0.85, 0.5)} />
        <m.path d="M136 70 Q144 88 136 106" {...draw(0.7, 0.5)} />
        <m.path d="M148 62 Q160 88 148 114" opacity="0.5" {...draw(0.85, 0.5)} />
      </g>

      <g transform="translate(88 88)">
        <m.g {...enter(0.1, 0, -24)}>
          <m.g
            style={{ originX: 0.5, originY: 0 }}
            {...(reduce
              ? {}
              : {
                  animate: { rotate: [0, -16, 13, -9, 5, -2, 0] },
                  transition: {
                    delay: 0.5,
                    duration: 1.1,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 2.4,
                  },
                })}
          >
            <circle cx="0" cy="-38" r="5" fill="var(--border-strong)" />
            <path d={BELL} fill="var(--secondary)" stroke="var(--border-strong)" strokeWidth="2" />
            <circle cx="0" cy="32" r="7" fill="var(--border-strong)" />
            {/* The logo's chevrons on the bell. */}
            <polyline
              points="-14,-12 -5,-3 -14,6"
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="14,-12 5,-3 14,6"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </m.g>
          <Badge reduce={reduce} />
        </m.g>
      </g>

      {/* The list of entries. */}
      <m.g {...enter(0.25, 36)}>
        <rect
          x="172"
          y="22"
          width="130"
          height="136"
          rx="10"
          fill="var(--card)"
          stroke="var(--border-strong)"
        />
        <line
          x1="186"
          y1="38"
          x2="226"
          y2="38"
          stroke="var(--muted-foreground)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line
          x1="258"
          y1="38"
          x2="288"
          y2="38"
          stroke="var(--accent-text)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </m.g>
      {ROWS.map((row, i) => (
        <m.g key={row.y} {...enter(ARRIVALS[i]!, 28)}>
          <rect
            x="180"
            y={row.y}
            width="114"
            height="28"
            rx="6"
            fill={i === 0 ? "var(--card)" : "var(--accent-soft)"}
          />
          {i === 0 && !reduce ? (
            // Unread until the pointer reads it.
            <m.rect
              x="180"
              y={row.y}
              width="114"
              height="28"
              rx="6"
              fill="var(--accent-soft)"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: READ_AT, duration: 0.3 }}
            />
          ) : null}
          <Glyph kind={row.glyph} x={196} y={row.y + 14} />
          <line
            x1="212"
            y1={row.y + 10}
            x2={212 + row.title}
            y2={row.y + 10}
            stroke="var(--foreground)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <line
            x1="212"
            y1={row.y + 19}
            x2={212 + row.text}
            y2={row.y + 19}
            stroke="var(--faint)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          {i === 0 && reduce ? null : (
            <m.circle
              cx="287"
              cy={row.y + 14}
              r="3.5"
              fill="var(--primary)"
              {...(i === 0
                ? {
                    initial: { opacity: 1, scale: 1 },
                    animate: { opacity: 0, scale: 0 },
                    transition: { delay: READ_AT, duration: 0.3 },
                  }
                : {})}
            />
          )}
        </m.g>
      ))}

      {/* The pointer reads the first entry. */}
      {reduce ? null : (
        <>
          <m.circle
            cx="250"
            cy="66"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            initial={{ r: 2, opacity: 0 }}
            // Keyframes start at 0: during the delay motion shows the first one.
            animate={{ r: [2, 2, 16], opacity: [0, 0.9, 0] }}
            transition={{
              delay: READ_AT - 0.1,
              duration: 0.55,
              times: [0, 0.1, 1],
              ease: "easeOut",
            }}
          />
          <m.path
            d="M0 0 L0 17 L4.5 12.5 L8 20 L11.5 18.5 L8 11 L14 11 Z"
            fill="var(--foreground)"
            stroke="var(--card)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            initial={{ x: 300, y: 176, opacity: 0 }}
            animate={{ x: [300, 248], y: [176, 64], opacity: [0, 1, 1, 0] }}
            transition={{
              delay: ARRIVALS[2] + 0.4,
              duration: 1.6,
              ease: SNAP_EASE,
              opacity: { delay: ARRIVALS[2] + 0.4, duration: 1.6, times: [0, 0.15, 0.85, 1] },
            }}
          />
        </>
      )}
    </svg>
  );
}

/** The red-dot badge with the number of unread entries, popping on every change. */
function Badge({ reduce }: { reduce: boolean }) {
  const final = COUNTS[COUNTS.length - 1]![0];
  return (
    <g transform="translate(24 -28)">
      <m.g
        {...(reduce
          ? {}
          : {
              initial: { scale: 0 },
              animate: { scale: [0, 1.25, 1, 1.25, 1, 1.25, 1, 0.85, 1] },
              transition: {
                delay: ARRIVALS[0],
                duration: READ_AT - ARRIVALS[0] + 0.3,
                times: [0, 0.04, 0.1, 0.24, 0.3, 0.44, 0.5, 0.92, 1],
              },
            })}
      >
        <circle r="13" fill="var(--primary)" stroke="var(--card)" strokeWidth="3" />
        {reduce ? (
          <BadgeNumber value={final} />
        ) : (
          COUNTS.map(([value, at], i) => {
            const until = COUNTS[i + 1]?.[1];
            return (
              <m.g
                key={at}
                initial={{ opacity: 0 }}
                animate={{ opacity: until === undefined ? 1 : [0, 1, 1, 0] }}
                transition={
                  until === undefined
                    ? { delay: at, duration: 0.15 }
                    : { delay: at, duration: until - at, times: [0, 0.05, 0.95, 1] }
                }
              >
                <BadgeNumber value={value} />
              </m.g>
            );
          })
        )}
      </m.g>
    </g>
  );
}

function BadgeNumber({ value }: { value: number }) {
  return (
    <text
      y="4.5"
      textAnchor="middle"
      fontSize="13"
      fontWeight="700"
      fill="var(--primary-foreground)"
      className="font-label"
    >
      {value}
    </text>
  );
}

/** The small symbol of an entry: a booked scrim, a message, a team event. */
function Glyph({ kind, x, y }: { kind: "check" | "bubble" | "chevron"; x: number; y: number }) {
  const common = {
    fill: "none",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r="9" fill="var(--secondary)" />
      {kind === "check" ? (
        <polyline points="-4,0 -1,3 4,-3" stroke="var(--success)" {...common} />
      ) : kind === "bubble" ? (
        <path d="M-4.5 -3.5 H4.5 V2 H-1 L-4 4.5 V2 H-4.5 Z" stroke="var(--primary)" {...common} />
      ) : (
        <polyline points="-2,-4 2,0 -2,4" stroke="var(--foreground)" {...common} />
      )}
    </g>
  );
}
