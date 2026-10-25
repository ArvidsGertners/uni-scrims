import { cn } from "cn";

// Decoration of the landing page (docs/design_handoff_landing_page): the two chevrons of the logo,
// sliding together once on load. The colours are tokens (globals.css), so they follow the mode;
// without motion (prefers-reduced-motion) they simply stand there.

/** Glow and the chevrons, huge and faint at the top right behind the hero. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute top-[-10%] left-1/2 ml-[-200px] h-[700px] w-[900px] bg-[radial-gradient(closest-side,var(--glow-hero),transparent)]" />
      <svg
        viewBox="0 0 400 400"
        className="absolute -top-[160px] -right-[260px] h-auto w-[min(900px,120vw)] opacity-90"
      >
        <polyline
          points="52,96 156,200 52,304"
          fill="none"
          stroke="var(--chevron-left)"
          strokeWidth={52}
          className="motion-safe:animate-snap-left"
        />
        <polyline
          points="348,96 244,200 348,304"
          fill="none"
          stroke="var(--chevron-right)"
          strokeWidth={52}
          className="motion-safe:animate-snap-right"
        />
      </svg>
    </div>
  );
}

/**
 * The icon of the logo above the closing call to action. Drawn with --foreground and --primary,
 * which are exactly the colours of uniscrims-icon.svg and uniscrims-icon-light.svg in each mode.
 */
export function SnapIcon({ className }: { className?: string }) {
  const snap = "motion-safe:[animation-duration:1s]";
  return (
    <svg aria-hidden viewBox="10 10 180 180" className={cn("size-14 shrink-0", className)}>
      <polyline
        points="26,48 78,100 26,152"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={26}
        className={cn("motion-safe:animate-snap-left", snap)}
      />
      <polyline
        points="174,48 122,100 174,152"
        fill="none"
        stroke="var(--primary)"
        strokeWidth={26}
        className={cn("motion-safe:animate-snap-right", snap)}
      />
    </svg>
  );
}
