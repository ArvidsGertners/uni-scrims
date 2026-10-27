// Pages that open as a dialog over the current page (SPEC N-31, ARCHITECTURE §5.33).

/** The addresses with an intercepting route in app/@modal. */
export const DIALOG_PATHS = [
  "/requests/new",
  "/ready",
  "/account",
  "/account/notifications",
  "/team/settings",
  "/support",
] as const;

export function isDialogPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return (DIALOG_PATHS as readonly string[]).includes(path);
}

export type CloseTarget = { kind: "back" } | { kind: "replace"; href: string };

/**
 * Back to the page behind when the dialog was intercepted and opened by a link from a page without
 * a dialog, so that page is the previous history entry; otherwise (loaded directly, or reached
 * from a directly loaded dialog) to the page the real route shows behind it.
 */
export function closeTarget({
  intercepted,
  enteredFromPage,
  fallback,
}: {
  intercepted: boolean;
  enteredFromPage: boolean;
  fallback: string;
}): CloseTarget {
  return intercepted && enteredFromPage ? { kind: "back" } : { kind: "replace", href: fallback };
}

/**
 * Whether the dialog now shown was opened from a page: stays true through switches between dialogs
 * (they replace the entry), false after a direct load or on a page.
 */
export function nextEnteredFromPage(
  previous: string | null,
  current: string,
  entered: boolean,
): boolean {
  if (!isDialogPath(current)) return false;
  if (previous === null) return false;
  return isDialogPath(previous) ? entered : true;
}
