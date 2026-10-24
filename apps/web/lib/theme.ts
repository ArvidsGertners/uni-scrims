import type { ThemePreference } from "@uni-scrims/db";

/** The --background of each mode (globals.css), for the browser's toolbar. */
const BACKGROUNDS = { light: "#f5f6f8", dark: "#0b0c0e" } as const;

/** The data-theme value on <html> (§5.16); none follows the system setting. */
export function themeAttribute(theme: ThemePreference | undefined): "light" | "dark" | undefined {
  if (theme === "LIGHT") return "light";
  if (theme === "DARK") return "dark";
  return undefined;
}

/** themeColor of the viewport: the chosen mode, or both by the system setting. */
export function themeColor(theme: ThemePreference | undefined) {
  const mode = themeAttribute(theme);
  if (mode) return BACKGROUNDS[mode];
  return [
    { media: "(prefers-color-scheme: light)", color: BACKGROUNDS.light },
    { media: "(prefers-color-scheme: dark)", color: BACKGROUNDS.dark },
  ];
}
