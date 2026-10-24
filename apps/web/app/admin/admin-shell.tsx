import {
  STAFF_ROLE_LABELS,
  type StaffArea,
  type getAdminOverview,
  staffArea,
} from "@uni-scrims/core";
import { cn } from "cn";
import type { ComponentType, ReactNode } from "react";
import {
  AlertTriangleIcon,
  BanIcon,
  BarChartIcon,
  LayoutGridIcon,
  MessageSquareIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "@/components/icons";
import { FlashToast } from "@/components/flash-toast";
import { LogoutButton } from "@/components/logout-button";
import { SidebarFrame } from "@/components/sidebar-frame";
import { SidebarLink } from "@/components/sidebar-link";
import { TabNav } from "@/components/tab-nav";
import { UserAvatar } from "@/components/user-avatar";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { adminHref, mainUrl, sharedCookieDomain } from "@/lib/admin-url";
import { readFlash } from "@/lib/flash";
import { missingLegalPages } from "@/lib/legal";

export type AdminOverview = Awaited<ReturnType<typeof getAdminOverview>>;
export type AdminPath = `/${string}`;

const AREAS: {
  path: AdminPath;
  label: string;
  area: StaffArea;
  icon: ComponentType<{ size?: number }>;
  count?: (overview: AdminOverview) => number | null;
}[] = [
  { path: "/", label: "Übersicht", area: "queue", icon: LayoutGridIcon },
  {
    path: "/queue",
    label: "Prüf-Queue",
    area: "queue",
    icon: ShieldCheckIcon,
    count: (o) => o.queue.pending,
  },
  {
    path: "/disputes",
    label: "Streitfälle",
    area: "admin",
    icon: AlertTriangleIcon,
    count: (o) => o.disputes,
  },
  { path: "/bans", label: "Sperren", area: "admin", icon: BanIcon },
  {
    path: "/notifications",
    label: "Nachrichten",
    area: "admin",
    icon: MessageSquareIcon,
    count: (o) => o.failedNotifications,
  },
  { path: "/stats", label: "Statistik", area: "admin", icon: BarChartIcon },
  { path: "/staff", label: "Rollen", area: "staff", icon: UsersIcon },
];

function CountBadge({
  count,
  className,
}: {
  count: number | null | undefined;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "rounded-pill bg-accent-soft px-2 py-0.5 font-label text-[11px] font-bold text-accent-text",
        className,
      )}
    >
      {count}
    </span>
  );
}

function BotDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13px] font-semibold",
        online ? "text-success" : "text-accent-text",
      )}
    >
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {online ? "Bot läuft" : "Bot offline"}
    </span>
  );
}

/**
 * Frame of every admin page (§5.14): sidebar from 1024 px, swipeable tabs below, warnings above
 * the content. Rendered by the pages, not the layout, so counts and bot status are fresh after
 * every client navigation.
 */
export async function AdminShell({
  overview,
  current,
  children,
}: {
  overview: AdminOverview;
  current: AdminPath;
  children: ReactNode;
}) {
  const { viewer } = overview;
  const areas = AREAS.filter((area) => staffArea(viewer.staffRole, area.area));
  // The legal texts concern admins; reviewers only see their queue (as before Phase 14).
  const missingLegal = staffArea(viewer.staffRole, "admin") ? await missingLegalPages() : [];
  const flash = await readFlash();

  return (
    // Like the site (§5.15): the sidebar at the left edge, the content filling the rest.
    <div className="flex w-full flex-1">
      {/* data-admin-sidebar: the admin header hides its logout from 1024 px while this exists. */}
      <SidebarFrame
        data-admin-sidebar
        top={
          <>
            <nav aria-label="Admin-Bereich" className="flex flex-col gap-0.5">
              {areas.map(({ path, label, icon: Icon, count }) => (
                <SidebarLink
                  key={path}
                  href={adminHref(path)}
                  active={path === current}
                  leading={<Icon size={17} />}
                  label={label}
                  trailing={<CountBadge count={count?.(overview)} />}
                />
              ))}
            </nav>
            {overview.bot ? (
              <div className="px-3">
                <BotDot online={overview.bot.online} />
              </div>
            ) : null}
          </>
        }
        bottom={
          <>
            <div className="flex items-center gap-3">
              <UserAvatar user={viewer} className="size-10 text-[12px]" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-label text-[14px] font-semibold">{viewer.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {STAFF_ROLE_LABELS[viewer.staffRole]}
                </span>
              </div>
            </div>
            <LogoutButton
              redirectTo={mainUrl("/")}
              className={buttonVariants({ variant: "outline", size: "sm", className: "w-full" })}
            />
          </>
        }
      />

      <div className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-7 pb-16 sm:px-8 xl:px-10">
        <div className="flex flex-col gap-3 lg:hidden">
          <TabNav
            label="Admin-Bereich"
            items={areas.map(({ path, label, count }) => ({
              href: adminHref(path),
              label,
              active: path === current,
              trailing: <CountBadge count={count?.(overview)} className="px-1.5" />,
            }))}
          />
          {overview.bot ? <BotDot online={overview.bot.online} /> : null}
        </div>
        {flash ? (
          <FlashToast
            key={flash.id}
            message={flash.message}
            domain={sharedCookieDomain()}
            className="max-w-none p-0 sm:px-0"
          />
        ) : null}
        {missingLegal.length > 0 ? (
          <Alert>
            <span>
              Rechtstexte fehlen in LEGAL_DIR oder enthalten noch „TODO“ (
              {missingLegal.map((page) => `${page}.txt`).join(", ")}): Bitte vor dem Go-Live
              ausfüllen.
            </span>
          </Alert>
        ) : null}
        <main className="flex min-w-0 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
