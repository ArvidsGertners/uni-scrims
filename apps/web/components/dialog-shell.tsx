import type { ReactNode } from "react";
import { FlashToast } from "@/components/flash-toast";
import { RouteDialog } from "@/components/route-dialog";
import { sharedCookieDomain } from "@/lib/admin-url";
import { readFlash } from "@/lib/flash";

/**
 * A route dialog with the success message inside (§5.33): rendered by the intercepting route over
 * the previous page, and by the real route over the page behind it.
 */
export async function DialogShell({
  title,
  size = "narrow",
  fallback,
  intercepted,
  children,
}: {
  title: ReactNode;
  size?: "narrow" | "wide";
  fallback: string;
  intercepted: boolean;
  children: ReactNode;
}) {
  const flash = await readFlash();
  return (
    <RouteDialog
      title={title}
      size={size}
      fallback={fallback}
      intercepted={intercepted}
      toast={
        flash ? (
          <FlashToast
            key={flash.id}
            message={flash.message}
            domain={sharedCookieDomain()}
            inDialog
            className="max-w-none"
          />
        ) : null
      }
    >
      {children}
    </RouteDialog>
  );
}
