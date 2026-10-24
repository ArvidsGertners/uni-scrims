import {
  STAFF_ROLE_LABELS,
  type StaffArea,
  type getAdminOverview,
  staffArea,
} from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
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
    <div className="mx-auto flex w-full max-w-6xl gap-10 px-5 pt-7 pb-16 sm:px-8">
      <aside data-admin-sidebar className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-7 flex h-[calc(100dvh-8rem)] min-h-[420px] flex-col gap-6">
          <nav aria-label="Admin-Bereich" className="flex flex-col gap-0.5">
            {areas.map(({ path, label, icon: Icon, count }) => {
              const active = path === current;
              return (
                <Link
                  key={path}
                  href={adminHref(path)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "type-btn flex h-10 items-center gap-2.5 rounded-sm px-3 text-[14px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground",
                    active && "bg-secondary text-foreground",
                  )}
                >
                  <Icon size={17} />
                  <span className="flex-1">{label}</span>
                  <CountBadge count={count?.(overview)} />
                </Link>
              );
            })}
          </nav>
          {overview.bot ? (
            <div className="px-3">
              <BotDot online={overview.bot.online} />
            </div>
          ) : null}
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
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
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-3 lg:hidden">
          <nav
            aria-label="Admin-Bereich"
            className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
          >
            {areas.map(({ path, label, count }) => (
              <Link
                key={path}
                href={adminHref(path)}
                aria-current={path === current ? "page" : undefined}
                className={cn(
                  "type-btn flex min-h-10 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-sm px-3 text-[14px] font-semibold whitespace-nowrap text-muted-foreground",
                  path === current && "bg-secondary text-foreground",
                )}
              >
                {label}
                <CountBadge count={count?.(overview)} className="px-1.5" />
              </Link>
            ))}
          </nav>
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
