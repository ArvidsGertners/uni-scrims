"use client";

import { cn } from "cn";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { type AppNavData, AppSidebar } from "@/components/app-nav";

/**
 * Signed-in pages with the sidebar at the left edge from 1024 px and the content filling the rest
 * (§5.15). Without ADMIN_URL the admin area lives under /admin and brings its own sidebar (§5.14),
 * so it gets none here.
 */
export function AppFrame({
  nav,
  adminHost,
  children,
}: {
  nav: AppNavData | null;
  adminHost: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const admin = adminHost || pathname === "/admin" || pathname.startsWith("/admin/");
  if (!nav || admin) {
    // The admin area gets a flex column, so its sidebar reaches down to the footer.
    return <div className={cn("flex-1", admin && "flex flex-col")}>{children}</div>;
  }
  return (
    <div className="flex w-full flex-1">
      <AppSidebar nav={nav} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
