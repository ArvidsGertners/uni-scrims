import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { siteChrome, siteNav } from "@/lib/header-user";

/** Root layout part around the page: the sidebar frame for signed-in users (§5.15). */
export async function SiteFrame({ children }: { children: ReactNode }) {
  const { adminHost } = await siteChrome();
  return (
    <AppFrame nav={await siteNav()} adminHost={adminHost}>
      {children}
    </AppFrame>
  );
}
