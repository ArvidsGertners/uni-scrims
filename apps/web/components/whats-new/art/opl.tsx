"use client";

import * as m from "motion/react-m";
import { useMessages } from "@/components/locale-provider";
import { whatsNewMessages } from "@/i18n/client";
import { SHIELD, useArtMotion } from "./motion";

/** The digits of a Discord ID as short dashes, the same on both cards. */
const ID_DASHES = [0, 11, 22, 33, 44, 55];
/** The members of the team; the first two are on the OPL roster. */
const MEMBERS = [118, 146, 174, 202, 230];
const MATCHES = 2;
/** The other players of the OPL roster, shown only as a count (SPEC N-35). */
const OTHERS = 3;

/**
 * OPL linking (SPEC N-35): the Uni Scrims account and the OPL profile carry the same Discord ID;
 * the IDs light up, two chain links snap together, and the team's roster below shows who matched.
 * No OPL logo here: it belongs to the OPL fields and links only.
 */
export function OplArt() {
  const t = useMessages(whatsNewMessages);
  const { draw, enter, pop, fade } = useArtMotion();
  return (
    <svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
      {/* Uni Scrims: the logo's chevrons. */}
      <m.g {...enter(0.1, -40)}>
        <Card x={18} />
        <polyline
          points="34,34 42,42 34,50"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="58,34 50,42 58,50"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="68"
          y1="42"
          x2="112"
          y2="42"
          stroke="var(--muted-foreground)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <IdRow x={34} litAt={0.8} />
      </m.g>

      {/* The OPL profile: name in text, an avatar. */}
      <m.g {...enter(0.25, 40)}>
        <Card x={194} />
        <circle cx="216" cy="42" r="9" fill="var(--secondary)" stroke="var(--border-strong)" />
        <text
          x="232"
          y="46.5"
          fontSize="12"
          fontWeight="700"
          fill="var(--foreground)"
          className="font-label"
        >
          {t.art.opl}
        </text>
        <line
          x1="262"
          y1="42"
          x2="288"
          y2="42"
          stroke="var(--faint)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <IdRow x={210} litAt={0.85} />
      </m.g>

      {/* Two chain links snap together. */}
      <m.rect
        x="134"
        y="47"
        width="30"
        height="18"
        rx="9"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="5"
        {...enter(1.35, -22)}
      />
      <m.rect
        x="156"
        y="47"
        width="30"
        height="18"
        rx="9"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="5"
        {...enter(1.35, 22)}
      />
      <m.g {...pop(1.75)}>
        <circle
          cx="160"
          cy="26"
          r="11"
          fill="var(--success)"
          stroke="var(--card)"
          strokeWidth="3"
        />
        <polyline
          points="155,26 158.5,29.5 165,22.5"
          fill="none"
          stroke="var(--card)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </m.g>

      {/* The roster: matched members by name, the rest only as a count. */}
      <m.g {...fade(1.9)}>
        <rect
          x="40"
          y="116"
          width="240"
          height="46"
          rx="10"
          fill="var(--card)"
          stroke="var(--border-strong)"
        />
        <g transform="translate(70 139) scale(0.42)">
          <path d={SHIELD} fill="var(--accent-soft)" stroke="var(--primary)" strokeWidth="4" />
        </g>
        <line
          x1="88"
          y1="139"
          x2="100"
          y2="139"
          stroke="var(--border)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </m.g>
      {MEMBERS.map((cx, i) => (
        <m.g key={cx} {...pop(2.1 + i * 0.1)}>
          <circle
            cx={cx}
            cy="139"
            r="10"
            fill={i < MATCHES ? "var(--accent-soft)" : "var(--secondary)"}
            stroke={i < MATCHES ? "var(--primary)" : "var(--border-strong)"}
            strokeWidth="2"
          />
          <circle cx={cx} cy="136" r="3.5" fill={i < MATCHES ? "var(--primary)" : "var(--faint)"} />
          <path
            d={`M${cx - 6} 145 Q${cx} 139 ${cx + 6} 145`}
            fill="none"
            stroke={i < MATCHES ? "var(--primary)" : "var(--faint)"}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </m.g>
      ))}
      {MEMBERS.slice(0, MATCHES).map((cx, i) => (
        <m.circle
          key={cx}
          cx={cx}
          cy="139"
          r="13.5"
          fill="none"
          stroke="var(--success)"
          strokeWidth="2"
          {...draw(2.75 + i * 0.15, 0.4)}
        />
      ))}
      <m.text
        x="252"
        y="144"
        fontSize="13"
        fontWeight="700"
        fill="var(--muted-foreground)"
        className="font-label"
        {...fade(3.1)}
      >
        +{OTHERS}
      </m.text>
    </svg>
  );
}

function Card({ x }: { x: number }) {
  return (
    <rect
      x={x}
      y="22"
      width="108"
      height="62"
      rx="10"
      fill="var(--card)"
      stroke="var(--border-strong)"
    />
  );
}

/**
 * The Discord ID row: a small tag and the digits as dashes, which light up in turn from `litAt`
 * (the same ID on both cards). Inside the card's group, so they move with it.
 */
function IdRow({ x, litAt }: { x: number; litAt: number }) {
  const { draw } = useArtMotion();
  return (
    <g>
      {ID_DASHES.map((offset) => (
        <line
          key={offset}
          x1={x + offset}
          y1="68"
          x2={x + offset + 6}
          y2="68"
          stroke="var(--border-strong)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
      {ID_DASHES.map((offset, i) => (
        <m.line
          key={`lit-${offset}`}
          x1={x + offset}
          y1="68"
          x2={x + offset + 6}
          y2="68"
          stroke="var(--success)"
          strokeWidth="4"
          strokeLinecap="round"
          {...draw(litAt + i * 0.07, 0.15)}
        />
      ))}
      <circle cx={x + 74} cy="68" r="5" fill="var(--secondary)" stroke="var(--border-strong)" />
    </g>
  );
}
