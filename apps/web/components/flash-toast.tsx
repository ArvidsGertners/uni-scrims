"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { FLASH_COOKIE } from "@/lib/flash-cookie";

/** Success toast above the content, hidden after 3.5 s (design handoff). */
export function FlashToast({
  message,
  domain,
  className,
}: {
  message: string;
  domain: string | null;
  /** The admin area places it in its content column (§5.14). */
  className?: string;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Shown once: the next page render must not find it again.
    // Set for both hosts with ADMIN_URL (lib/flash.ts), so deleted with that domain too; also
    // host-only, in case ADMIN_URL was switched on within the last minute.
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    if (domain) document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; domain=${domain}`;
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [domain]);
  if (!visible) return null;
  return (
    <div className={cn("mx-auto w-full max-w-3xl px-5 pt-4 sm:px-8", className)}>
      <Alert variant="success" role="status" className="items-center">
        <span>{message}</span>
      </Alert>
    </div>
  );
}
