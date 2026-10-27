"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  type MouseEvent,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { DirtyGuardProvider, useDirtyGuardLeave } from "@/components/dirty-guard";
import { XIcon } from "@/components/icons";
import { useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { routeDialogMessages } from "@/i18n/client";
import { closeTarget } from "@/lib/route-dialog";
import {
  dialogEnteredFromPage,
  interceptedRouteDialogCount,
  registerRouteDialog,
  subscribeRouteDialogs,
  trackPath,
} from "@/lib/route-dialog-store";

// A page shown as a dialog over the current page (SPEC N-31, §5.33).

const RouteDialogContext = createContext<{ requestClose: () => void } | null>(null);

/** Follows the path, so a dialog knows whether it was opened from a page (root layout). */
export function RouteDialogTracker() {
  const pathname = usePathname();
  useEffect(() => trackPath(pathname), [pathname]);
  return null;
}

export function RouteDialog({
  title,
  size,
  fallback,
  intercepted,
  toast,
  children,
}: {
  title: ReactNode;
  size: "narrow" | "wide";
  /** The page the real route shows behind the dialog. */
  fallback: string;
  /** Rendered by the intercepting route in app/@modal, over the previous page. */
  intercepted: boolean;
  /** The success message, shown inside while the dialog is open. */
  toast: ReactNode;
  children: ReactNode;
}) {
  return (
    <DirtyGuardProvider>
      <RouteDialogFrame
        title={title}
        size={size}
        fallback={fallback}
        intercepted={intercepted}
        toast={toast}
      >
        {children}
      </RouteDialogFrame>
    </DirtyGuardProvider>
  );
}

function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function RouteDialogFrame({
  title,
  size,
  fallback,
  intercepted,
  toast,
  children,
}: Parameters<typeof RouteDialog>[0]) {
  const t = useMessages(routeDialogMessages);
  const router = useRouter();
  const { isDirty, leave } = useDirtyGuardLeave();
  const [closing, setClosing] = useState(false);
  // A directly loaded dialog steps aside while an intercepted one is open over it.
  const covered = useSyncExternalStore(
    subscribeRouteDialogs,
    () => !intercepted && interceptedRouteDialogCount() > 0,
    () => false,
  );

  useEffect(() => registerRouteDialog(intercepted), [intercepted]);

  const close = useCallback(() => {
    const target = closeTarget({ intercepted, enteredFromPage: dialogEnteredFromPage(), fallback });
    setClosing(true);
    if (target.kind === "back") router.back();
    else router.replace(target.href, { scroll: false });
  }, [intercepted, fallback, router]);

  const requestClose = useCallback(() => leave(close), [leave, close]);

  // Links inside the dialog: with unsaved changes they wait for the prompt.
  function guardLinks(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || !isPlainClick(event) || !(event.target instanceof Element))
      return;
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || !isDirty()) return;
    event.preventDefault();
    const href = `${url.pathname}${url.search}${url.hash}`;
    const replace = anchor.dataset.dialogReplace !== undefined;
    leave(() => (replace ? router.replace(href) : router.push(href)));
  }

  return (
    <RouteDialogContext value={{ requestClose }}>
      <Dialog
        open={!closing && !covered}
        onOpenChange={(next) => (next ? undefined : requestClose())}
      >
        <DialogContent size={size} onClickCapture={guardLinks}>
          <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-card px-5 py-3.5 sm:px-8">
            <DialogTitle className="min-w-0 flex-1 self-center">{title}</DialogTitle>
            {/* Icon only on narrow phones, so a long title keeps its words. */}
            <Button
              variant="outline"
              onClick={requestClose}
              aria-label={t.close}
              className="-mr-1 shrink-0 max-[400px]:size-11 max-[400px]:px-0"
            >
              <XIcon size={18} strokeWidth={2.2} />
              <span className="max-[400px]:hidden">{t.close}</span>
            </Button>
          </div>
          {toast}
          <div className="flex flex-col gap-7 px-5 pt-6 pb-8 sm:px-8">{children}</div>
        </DialogContent>
      </Dialog>
    </RouteDialogContext>
  );
}

/** "Abbrechen" and the like inside a route dialog: closes it like the close button. */
export function RouteDialogClose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(RouteDialogContext);
  return (
    <Button variant="ghost" className={className} onClick={() => context?.requestClose()}>
      {children}
    </Button>
  );
}
