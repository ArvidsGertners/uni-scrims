"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { type AppNavData, AppSidebar } from "@/components/app-nav";

/**
 * Signed-in pages with the sidebar on the left from 1024 px (§5.15). Without ADMIN_URL the admin
 * area lives under /admin and brings its own sidebar (§5.14), so it gets none here.
 */
export function AppFrame({ nav, children }: { nav: AppNavData | null; children: ReactNode }) {
  const pathname = usePathname();
  if (!nav || pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <div className="flex-1">{children}</div>;
  }
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 lg:pl-8">
      <aside className="hidden w-56 shrink-0 pt-7 lg:block">
        <AppSidebar nav={nav} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
