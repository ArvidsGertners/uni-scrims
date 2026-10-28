"use client";

import * as m from "motion/react-m";
import { useMessages } from "@/components/locale-provider";
import { leagueMessages } from "@/i18n/format";
import { SHIELD, SNAP_EASE, useArtMotion } from "./motion";
/** The podium: division, left edge and height, on the base line BASE. */
const BASE = 160;
const STEPS = [
  { division: 2, x: 22, height: 54, delay: 0.25 },
  { division: 1, x: 72, height: 80, delay: 0.1 },
  { division: 3, x: 122, height: 36, delay: 0.4 },
] as const;
/** The filter chips, one per division; the first one gets picked. */
const CHIPS = [1, 2, 3] as const;
const FILTER_AT = 2.0;
/** Board cards in a 2 × 2 grid; only the division 1 cards stay after the filter. */
const CARDS = [
  { x: 186, y: 92, division: 1 },
  { x: 246, y: 92, division: 2 },
  { x: 186, y: 134, division: 3 },
  { x: 246, y: 134, division: 1 },
] as const;

/**
 * The Uniliga division (SPEC N-36): a podium rises, the own team's shield drops onto division 1 and
 * its badge unfolds; the division filter then keeps only the matching board cards.
 */
export function UniligaLeagueArt() {
  const t = useMessages(leagueMessages);
  const { reduce, draw, enter, pop, fade } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      {/* The podium rises from the base line. */}
      {STEPS.map((step) => (
        <g key={step.division}>
          <m.rect
            x={step.x}
            y={BASE - step.height}
            width="48"
            height={step.height}
            rx="4"
            fill={step.division === 1 ? "var(--accent-soft)" : "var(--secondary)"}
            stroke={step.division === 1 ? "var(--primary)" : "var(--border-strong)"}
            strokeWidth="2"
            style={{ originY: 1 }}
            {...(reduce
              ? {}
              : {
                  initial: { scaleY: 0 },
                  animate: { scaleY: 1 },
                  transition: { delay: step.delay, duration: 0.6, ease: SNAP_EASE },
                })}
          />
          <m.text
            x={step.x + 24}
            y={BASE - step.height + 24}
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fill={step.division === 1 ? "var(--primary)" : "var(--muted-foreground)"}
            className="font-label"
            {...fade(step.delay + 0.45)}
          >
            {step.division}
          </m.text>
        </g>
      ))}
      <m.line
        x1="12"
        y1={BASE}
        x2="180"
        y2={BASE}
        stroke="var(--border-strong)"
        strokeWidth="2.5"
        strokeLinecap="round"
        {...draw(0, 0.5)}
      />

      {/* The own team drops onto division 1 with a spring. */}
      <g transform={`translate(96 ${BASE - 80 - 24})`}>
        <m.g {...enter(0.9, 0, -70)}>
          <g transform="scale(0.5)">
            <path d={SHIELD} fill="var(--card)" stroke="var(--primary)" strokeWidth="4" />
            <polyline
              points="-12,-14 4,2 -12,18"
              fill="none"
              stroke="var(--foreground)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </m.g>
      </g>
      {/* Sparks once it lands. */}
      <g stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round">
        <m.line x1="68" y1="86" x2="60" y2="80" {...draw(1.35, 0.25)} />
        <m.line x1="66" y1="102" x2="56" y2="102" {...draw(1.4, 0.25)} />
        <m.line x1="124" y1="86" x2="132" y2="80" {...draw(1.35, 0.25)} />
        <m.line x1="126" y1="102" x2="136" y2="102" {...draw(1.4, 0.25)} />
      </g>

      {/* The badge unfolds from its left edge. */}
      <m.g
        style={{ originX: 0 }}
        {...(reduce
          ? {}
          : {
              initial: { scaleX: 0, opacity: 0 },
              animate: { scaleX: 1, opacity: 1 },
              transition: { delay: 1.45, duration: 0.5, ease: SNAP_EASE },
            })}
      >
        <rect
          x="184"
          y="20"
          width="122"
          height="24"
          rx="12"
          fill="var(--accent-soft)"
          stroke="var(--primary)"
        />
        <text
          x="245"
          y="35.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          fill="var(--accent-text)"
          className="font-label"
        >
          {t.league(1, "A")}
        </text>
      </m.g>

      {/* The filter: one chip per division, division 1 gets picked. */}
      {CHIPS.map((division, i) => (
        <m.g key={division} {...enter(1.6 + i * 0.08, 0, 8)}>
          <rect
            x={186 + i * 40}
            y="58"
            width="34"
            height="20"
            rx="10"
            fill="var(--secondary)"
            stroke="var(--border-strong)"
          />
          <text
            x={203 + i * 40}
            y="72"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--muted-foreground)"
            className="font-label"
          >
            {division}
          </text>
        </m.g>
      ))}
      <m.g {...pop(FILTER_AT)}>
        <rect x="186" y="58" width="34" height="20" rx="10" fill="var(--primary)" />
        <text
          x="203"
          y="72"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill="var(--primary-foreground)"
          className="font-label"
        >
          {CHIPS[0]}
        </text>
      </m.g>

      {/* Board cards; the others fade once the filter applies. */}
      {CARDS.map((card, i) => {
        const keep = card.division === 1;
        return (
          <m.g key={`${card.x}-${card.y}`} {...enter(1.75 + i * 0.08, 0, 10)}>
            <m.g
              {...(keep
                ? {}
                : reduce
                  ? { opacity: 0.2 }
                  : {
                      animate: { opacity: [1, 0.2] },
                      transition: { delay: FILTER_AT + 0.25, duration: 0.4 },
                    })}
            >
              <rect
                x={card.x}
                y={card.y}
                width="54"
                height="34"
                rx="6"
                fill="var(--card)"
                stroke="var(--border-strong)"
              />
              <g transform={`translate(${card.x + 13} ${card.y + 17}) scale(0.24)`}>
                <path
                  d={SHIELD}
                  fill={keep ? "var(--accent-soft)" : "var(--secondary)"}
                  stroke={keep ? "var(--primary)" : "var(--border-strong)"}
                  strokeWidth="8"
                />
              </g>
              <line
                x1={card.x + 24}
                y1={card.y + 13}
                x2={card.x + 46}
                y2={card.y + 13}
                stroke="var(--muted-foreground)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <rect
                x={card.x + 24}
                y={card.y + 19}
                width="16"
                height="8"
                rx="4"
                fill={keep ? "var(--primary)" : "var(--border-strong)"}
              />
            </m.g>
            {keep ? (
              <m.rect
                x={card.x}
                y={card.y}
                width="54"
                height="34"
                rx="6"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                {...draw(FILTER_AT + 0.35, 0.5)}
              />
            ) : null}
          </m.g>
        );
      })}
    </svg>
  );
}
