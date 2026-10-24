import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import type { AppNavData } from "@/components/app-nav";
import { isAdminHost } from "@/lib/admin-url";
import { siteChrome } from "@/lib/header-user";

/** The navigation data of the signed-in user, or null (logged out, admin host). */
export async function siteNav(): Promise<AppNavData | null> {
  const { user, active, team } = await siteChrome();
  if (!user || isAdminHost((await headers()).get("host"))) return null;
  return {
    full: active,
    account: {
      id: user.id,
      name: user.name,
      avatarVersion: user.avatarVersion,
      unverified: active && !user.verifiedAt,
    },
    team,
  };
}

/** Root layout part around the page: the sidebar frame for signed-in users (§5.15). */
export async function SiteFrame({ children }: { children: ReactNode }) {
  return <AppFrame nav={await siteNav()}>{children}</AppFrame>;
}
