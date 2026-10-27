import { nextEnteredFromPage } from "./route-dialog.ts";

// Shared state of the route dialogs in the browser (§5.33): how the current one was reached and
// which are mounted. Read with useSyncExternalStore.

const listeners = new Set<() => void>();
let previousPath: string | null = null;
let enteredFromPage = false;
let openCount = 0;
let interceptedCount = 0;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeRouteDialogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by RouteDialogTracker on every change of the path. */
export function trackPath(pathname: string) {
  if (pathname === previousPath) return;
  enteredFromPage = nextEnteredFromPage(previousPath, pathname, enteredFromPage);
  previousPath = pathname;
}

export function dialogEnteredFromPage(): boolean {
  return enteredFromPage;
}

/** Registers a mounted route dialog; returns the cleanup. */
export function registerRouteDialog(intercepted: boolean): () => void {
  openCount += 1;
  if (intercepted) interceptedCount += 1;
  emit();
  return () => {
    openCount -= 1;
    if (intercepted) interceptedCount -= 1;
    emit();
  };
}

export function openRouteDialogCount(): number {
  return openCount;
}

export function interceptedRouteDialogCount(): number {
  return interceptedCount;
}
