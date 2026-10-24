import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { siteNav } from "@/lib/header-user";

/** Root layout part around the page: the sidebar frame for signed-in users (§5.15). */
export async function SiteFrame({ children }: { children: ReactNode }) {
  return <AppFrame nav={await siteNav()}>{children}</AppFrame>;
}
