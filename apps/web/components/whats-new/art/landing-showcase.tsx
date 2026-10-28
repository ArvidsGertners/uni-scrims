"use client";

import * as m from "motion/react-m";
import { useMessages } from "@/components/locale-provider";
import { whatsNewMessages } from "@/i18n/client";
import { SNAP_EASE, useArtMotion } from "./motion";

/** The team tiles of the front page: 4 × 2, the own team takes the free slot. */
const COLUMNS = [34, 86, 138, 190];
const ROWS = [74, 118];
const FREE = { column: 2, row: 1 };
/** The switch flips at SWITCH_AT, then the own tile flies into its slot. */
const SWITCH_AT = 1.9;

/**
 * Teams on the front page (SPEC N-34): a browser window draws itself, the listed teams pop into
 * the grid, the captain flips "Allowed" and the own team flies into the free slot.
 */
export function LandingShowcaseArt() {
  const t = useMessages(whatsNewMessages);
  const { reduce, draw, enter, pop, fade } = useArtMotion();
  const free = { x: COLUMNS[FREE.column]!, y: ROWS[FREE.row]! };
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      {/* The browser window. */}
      <m.rect
        x="16"
        y="14"
        width="236"
        height="152"
        rx="10"
        fill="var(--card)"
        stroke="var(--border-strong)"
        strokeWidth="2"
        {...draw(0, 0.8)}
      />
      <m.g {...fade(0.5)}>
        <line x1="16" y1="34" x2="252" y2="34" stroke="var(--border)" strokeWidth="1.5" />
        {[28, 38, 48].map((cx) => (
          <circle key={cx} cx={cx} cy="24" r="3" fill="var(--border-strong)" />
        ))}
        <rect x="64" y="19" width="120" height="10" rx="5" fill="var(--secondary)" />
        {/* The hero: the logo's chevrons and a headline. */}
        <polyline
          points="34,46 40,52 34,58"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="52,46 46,52 52,58"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </m.g>
      <m.line
        x1="62"
        y1="52"
        x2="168"
        y2="52"
        stroke="var(--foreground)"
        strokeWidth="6"
        strokeLinecap="round"
        {...draw(0.6, 0.5)}
      />

      {/* The listed teams. */}
      {ROWS.flatMap((y, row) =>
        COLUMNS.map((x, column) =>
          row === FREE.row && column === FREE.column ? (
            <m.rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="44"
              height="38"
              rx="6"
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              {...fade(0.9 + (row * 4 + column) * 0.07)}
            />
          ) : (
            <m.g key={`${x}-${y}`} {...pop(0.9 + (row * 4 + column) * 0.07)}>
              <Tile x={x} y={y} />
            </m.g>
          ),
        ),
      )}

      {/* The captain's switch, floating over the window's edge. */}
      <m.g {...enter(1.3, 24)}>
        <rect
          x="214"
          y="124"
          width="94"
          height="38"
          rx="10"
          fill="var(--popover)"
          stroke="var(--border-strong)"
          style={{ filter: "drop-shadow(0 4px 10px rgb(0 0 0 / 0.18))" }}
        />
        <text
          x="222"
          y="147"
          fontSize="11"
          fontWeight="700"
          fill="var(--foreground)"
          className="font-label"
        >
          {t.art.allowed}
        </text>
        <rect x="274" y="135" width="26" height="16" rx="8" fill="var(--secondary)" />
        {reduce ? (
          <rect x="274" y="135" width="26" height="16" rx="8" fill="var(--primary)" />
        ) : (
          <m.rect
            x="274"
            y="135"
            width="26"
            height="16"
            rx="8"
            fill="var(--primary)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: SWITCH_AT, duration: 0.2 }}
          />
        )}
        <m.circle
          cy="143"
          r="6"
          fill="var(--card)"
          stroke="var(--border-strong)"
          {...(reduce
            ? { cx: 292 }
            : {
                initial: { cx: 282 },
                animate: { cx: 292 },
                transition: { delay: SWITCH_AT, type: "spring", stiffness: 500, damping: 26 },
              })}
        />
      </m.g>

      {/* The own team flies from the switch into the free slot. */}
      <m.g
        {...(reduce
          ? {}
          : {
              initial: { opacity: 0, x: 248 - free.x, y: 124 - free.y, scale: 0.6 },
              animate: { opacity: 1, x: 0, y: 0, scale: 1 },
              transition: { delay: SWITCH_AT + 0.25, duration: 0.7, ease: SNAP_EASE },
            })}
      >
        <Tile x={free.x} y={free.y} own />
      </m.g>
      {reduce ? null : (
        <m.rect
          x={free.x - 3}
          y={free.y - 3}
          width="50"
          height="44"
          rx="8"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 1 }}
          animate={{ opacity: [0, 0.9, 0], scale: [1, 1, 1.18] }}
          transition={{
            delay: SWITCH_AT + 0.9,
            duration: 1.2,
            repeat: Infinity,
            repeatDelay: 1.4,
          }}
        />
      )}
    </svg>
  );
}

/** A team tile: logo square and name; the own one in the accent with the logo's chevron. */
function Tile({ x, y, own = false }: { x: number; y: number; own?: boolean }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width="44"
        height="38"
        rx="6"
        fill={own ? "var(--primary)" : "var(--secondary)"}
        stroke={own ? "var(--primary)" : "var(--border)"}
      />
      {own ? (
        <polyline
          points={`${x + 18},${y + 9} ${x + 25},${y + 16} ${x + 18},${y + 23}`}
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <rect x={x + 15} y={y + 7} width="14" height="14" rx="3" fill="var(--border-strong)" />
      )}
      <line
        x1={x + 10}
        y1={y + 30}
        x2={x + 34}
        y2={y + 30}
        stroke={own ? "var(--primary-foreground)" : "var(--faint)"}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </g>
  );
}
