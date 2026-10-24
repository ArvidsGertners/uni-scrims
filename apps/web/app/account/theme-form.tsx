"use client";

import type { ThemePreference } from "@uni-scrims/db";
import { cn } from "cn";
import { useActionState } from "react";
import { initialActionState } from "@/lib/action-state";
import { setThemeAction } from "./actions";

/**
 * System, Hell or Dunkel (SPEC N-13) as three submit buttons, so it works without JavaScript too;
 * the layout renders anew with the chosen data-theme.
 */
export function ThemeForm({
  current,
  options,
}: {
  current: ThemePreference;
  options: { value: ThemePreference; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(setThemeAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="Design"
        className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-background p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="submit"
            name="theme"
            value={option.value}
            aria-pressed={option.value === current}
            disabled={pending}
            className={cn(
              "type-btn min-h-10 cursor-pointer rounded-sm px-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed",
              option.value === current && "bg-secondary text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {state.error ? <p className="text-[14px] text-accent-text">{state.error}</p> : null}
    </form>
  );
}
