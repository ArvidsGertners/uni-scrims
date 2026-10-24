"use client";

import type { ThemePreference } from "@uni-scrims/db";
import { type ReactNode, createContext, useContext } from "react";

const ThemeContext = createContext<ThemePreference>("SYSTEM");

/** The account's design for client components (§5.16); the root layout passes it down. */
export function ThemeProvider({
  theme,
  children,
}: {
  theme: ThemePreference;
  children: ReactNode;
}) {
  return <ThemeContext value={theme}>{children}</ThemeContext>;
}

export function useTheme(): ThemePreference {
  return useContext(ThemeContext);
}
