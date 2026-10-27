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
  useRef,
  useState,
} from "react";
import { markWhatsNewSeenAction } from "@/app/actions";

// Loaded only once the dialog opens, so Motion stays out of every page's bundle (§5.31).
const loadDialog = () => import("./whats-new-dialog");
const WhatsNewDialog = dynamic(() => loadDialog().then((module) => module.WhatsNewDialog), {
  ssr: false,
});

const WhatsNewContext = createContext<{ open: () => void }>({ open: () => undefined });

/** "Neuigkeiten" in the account menu opens the dialog again (SPEC N-29). */
export function useWhatsNew() {
  return useContext(WhatsNewContext);
}

/** The page shows first, then the dialog. */
const OPEN_DELAY_MS = 700;

/**
 * The what's new dialog (SPEC N-29, §5.31): opens by itself when `due` (an active account that has
 * not closed the current edition), and through useWhatsNew().open(). Closing a due dialog saves the
 * edition on the account; until the next load the browser keeps it closed by itself.
 */
export function WhatsNewProvider({ due, children }: { due: boolean; children: ReactNode }) {
  const pathname = usePathname();
  // Without ADMIN_URL the admin area lives under /admin; it never shows the dialog.
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closed = useRef(false);
  const show = useCallback(() => {
    setMounted(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!due || admin || closed.current) return;
    void loadDialog();
    const timer = setTimeout(show, OPEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [due, admin, show]);

  const close = useCallback(() => {
    setOpen(false);
    if (!due || closed.current) return;
    closed.current = true;
    // Not saved: it simply comes again with the next load.
    startTransition(async () => {
      await markWhatsNewSeenAction(WHATS_NEW_EDITION).catch(() => false);
    });
  }, [due]);

  const value = useMemo(() => ({ open: show }), [show]);
  return (
    <WhatsNewContext value={value}>
      {children}
      {mounted ? <WhatsNewDialog open={open} onClose={close} /> : null}
    </WhatsNewContext>
  );
}
