// Shared motion presets of the what's new art (§5.31). With reduced motion everything is drawn in
// its final state at once: no drawing, sliding or looping.
import { useReducedMotion } from "motion/react";

/** The site's snap curve (globals.css, animate-snap-*). */
export const SNAP_EASE = [0.2, 0.9, 0.2, 1] as const;

export function useArtMotion() {
  const reduce = useReducedMotion() ?? false;
  return {
    reduce,
    /** A stroke that draws itself. */
    draw: (delay: number, duration = 0.6) =>
      reduce
        ? {}
        : {
            initial: { pathLength: 0, opacity: 0 },
            animate: { pathLength: 1, opacity: 1 },
            transition: { delay, duration, ease: SNAP_EASE },
          },
    /** Comes in from an offset with a spring. */
    enter: (delay: number, x = 0, y = 0) =>
      reduce
        ? {}
        : {
            initial: { opacity: 0, x, y },
            animate: { opacity: 1, x: 0, y: 0 },
            transition: { delay, type: "spring" as const, stiffness: 240, damping: 22 },
          },
    /** Pops up from small. */
    pop: (delay: number) =>
      reduce
        ? {}
        : {
            initial: { opacity: 0, scale: 0.4 },
            animate: { opacity: 1, scale: 1 },
            transition: { delay, type: "spring" as const, stiffness: 420, damping: 16 },
          },
    /** Fades in. */
    fade: (delay: number, duration = 0.4) =>
      reduce
        ? {}
        : {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { delay, duration },
          },
  };
}
