import type { Locale } from "@uni-scrims/core/config/locale";
import { useId } from "react";

// The flags of the language menu (§5.21) as inline SVGs: emoji flags show as letters on Windows.
// Fixed colours, the one exception to colours in tokens besides the QR code's white background.

function GermanFlag() {
  return (
    <svg viewBox="0 0 5 3" preserveAspectRatio="none" className="size-full">
      <rect width="5" height="1" fill="#000" />
      <rect y="1" width="5" height="1" fill="#d00" />
      <rect y="2" width="5" height="1" fill="#ffce00" />
    </svg>
  );
}

/** The Union Jack; cut to 3:2 like the German flag. The ids are per instance, as both show at once. */
function BritishFlag() {
  const id = useId();
  const outline = `${id}-outline`;
  const diagonals = `${id}-diagonals`;
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className="size-full">
      <clipPath id={outline}>
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id={diagonals}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${outline})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 L60,30 M60,0 L0,30"
          clipPath={`url(#${diagonals})`}
          stroke="#c8102e"
          strokeWidth="4"
        />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  );
}

/** The flag of a language, 21 × 14 px, decorative: the language name is next to it or the label. */
export function LocaleFlag({ locale }: { locale: Locale }) {
  return (
    // A thin ring, so the white parts stand out in light mode.
    <span
      aria-hidden
      className="inline-flex h-3.5 w-[21px] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-border-strong"
    >
      {locale === "de" ? <GermanFlag /> : <BritishFlag />}
    </span>
  );
}
