"use client";

import { WHATS_NEW_EDITION } from "@uni-scrims/core/config/whats-new";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { markWhatsNewSeenAction } from "@/app/actions";
import { isAdminPath } from "@/lib/admin-path";

// Loaded only once the dialog opens, so Motion stays out of every page's bundle (§5.31).
const loadDialog = () => import("./whats-new-dialog");
const WhatsNewDialog = dynamic(() => loadDialog().then((module) => module.WhatsNewDialog), {
  ssr: false,
});

const WhatsNewContext = createContext<{ open: () => void; pending: boolean; showing: boolean }>({
  open: () => undefined,
  pending: false,
  showing: false,
});

/**
 * "Neuigkeiten" in the account menu opens the dialog again (SPEC N-29); `pending`: the current
 * edition is due and not closed in this tab, for the bell (SPEC N-32); `showing`: the dialog is open,
 * so the landing page question waits (SPEC N-34).
 */
export function useWhatsNew() {
  return useContext(WhatsNewContext);
}

/** The page shows first, then the dialog. */
const OPEN_DELAY_MS = 700;

/**
 * The what's new dialog (SPEC N-29, §5.31): opens by itself when `due` (an active account that has
 * not closed the current edition), and through useWhatsNew().open(). Closing a due dialog saves the
 * edition on the account; until the next load the browser keeps it closed by itself, per account,
 * since the root layout outlives a sign-out and sign-in in the same tab.
 */
export function WhatsNewProvider({
  due,
  userId,
  children,
}: {
  due: boolean;
  userId: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const admin = isAdminPath(pathname);
  const [open, setOpen] = useState(false);
  // Every opening starts a fresh dialog on the first slide.
  const [opening, setOpening] = useState(0);
  // Whose dialog was closed in this tab (the root layout outlives a sign-out).
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const show = useCallback(() => {
    if (admin) return;
    setOpening((count) => count + 1);
    setOpen(true);
  }, [admin]);

  useEffect(() => {
    if (!due || admin || closedFor === userId) return;
    void loadDialog();
    const timer = setTimeout(show, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, admin, userId, show, closedFor]);

  const close = useCallback(() => {
    setOpen(false);
    if (!due || closedFor === userId) return;
    setClosedFor(userId);
    // Not saved: it simply comes again with the next load.
    startTransition(async () => {
      await markWhatsNewSeenAction(WHATS_NEW_EDITION).catch(() => false);
    });
  }, [due, userId, closedFor]);

  const pending = due && !admin && closedFor !== userId;
  const value = useMemo(() => ({ open: show, pending, showing: open }), [show, pending, open]);
  return (
    <WhatsNewContext value={value}>
      {children}
      {opening > 0 ? <WhatsNewDialog key={opening} open={open} onClose={close} /> : null}
    </WhatsNewContext>
  );
}
