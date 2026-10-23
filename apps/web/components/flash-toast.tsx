"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { FLASH_COOKIE } from "@/lib/flash-cookie";

/** Success toast above the content, hidden after 3.5 s (design handoff). */
export function FlashToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    // Shown once: the next page render must not find it again.
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-4 sm:px-8">
      <Alert variant="success" role="status" className="items-center">
        <span>{message}</span>
      </Alert>
    </div>
  );
}
