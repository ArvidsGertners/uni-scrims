import type { ThemePreference } from "@uni-scrims/db";
import { cn } from "@/lib/utils";

// The files of public/brand (BRAND.md), each for a dark and a light background; never recoloured.
const FILES = {
  logo: {
    dark: "/brand/uniscrims-logo.svg",
    light: "/brand/uniscrims-logo-light.svg",
    width: 405,
    height: 88,
    // 28 px high is 129 px wide; below 120 px the brand asks for the icon.
    size: "h-7 w-auto",
  },
  icon: {
    dark: "/brand/uniscrims-icon.svg",
    light: "/brand/uniscrims-icon-light.svg",
    width: 180,
    height: 180,
    size: "size-7",
  },
} as const;

/**
 * The uniscrims logo, or only its icon where space is tight, in the variant for the current mode:
 * by the system setting through <picture>, without JavaScript, or as the account chose (§5.16).
 */
export function BrandLogo({
  variant = "logo",
  theme,
  className,
}: {
  variant?: keyof typeof FILES;
  theme: ThemePreference;
  className?: string;
}) {
  const file = FILES[variant];
  return (
    <picture className={cn("shrink-0", className)}>
      {theme === "SYSTEM" ? (
        <source media="(prefers-color-scheme: light)" srcSet={file.light} />
      ) : null}
      <img
        src={theme === "LIGHT" ? file.light : file.dark}
        alt="Uni Scrims"
        width={file.width}
        height={file.height}
        className={cn("block", file.size)}
      />
    </picture>
  );
}
