import { cn } from "@/lib/utils";

// The monochrome OPL marks from OPL's brand kit (docs/opl, copied unchanged to public/opl; "dark" is
// black for light backgrounds, "light" white for dark ones). Coloured only with OPL's consent
// (SPEC N-35). Both files are in the page and CSS shows the one for the mode (dark/light variants of
// globals.css), so the mark needs no theme prop and works in client components too.
const FILES = {
  icon: { black: "/opl/icon-dark.svg", white: "/opl/icon-light.svg", width: 500, height: 429 },
  wordmark: { black: "/opl/logo-dark.svg", white: "/opl/logo-light.svg", width: 1177, height: 429 },
} as const;

/**
 * The OPL mark. `alt` is "OPL" when it stands alone; empty where a text next to it says OPL.
 * Sized by `className` (height; the width follows).
 */
export function OplLogo({
  variant = "icon",
  alt = "OPL",
  className,
}: {
  variant?: keyof typeof FILES;
  alt?: string;
  className?: string;
}) {
  const file = FILES[variant];
  const image = "block h-full w-auto";
  return (
    <span className={cn("inline-flex shrink-0 align-middle", className ?? "h-4")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG, already sized */}
      <img
        src={file.black}
        alt={alt}
        width={file.width}
        height={file.height}
        className={cn(image, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG, already sized */}
      <img
        src={file.white}
        alt={alt}
        width={file.width}
        height={file.height}
        className={cn(image, "hidden dark:block")}
      />
    </span>
  );
}
