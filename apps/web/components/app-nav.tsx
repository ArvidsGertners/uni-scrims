"use client";

import type { TeamLogoInfo } from "@uni-scrims/core";
import { cn } from "cn";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { LayersIcon, MenuIcon, UsersIcon, XIcon } from "@/components/icons";
import { SidebarFrame } from "@/components/sidebar-frame";
import { SidebarLink } from "@/components/sidebar-link";
import { TeamAvatar } from "@/components/team-avatar";
import { UserAvatar } from "@/components/user-avatar";
import { WarningDot } from "@/components/warning-dot";

/** What the navigation of the site shows (§5.15), from siteChrome. */
export type AppNavData = {
  /** Banned users and incomplete accounts only get Konto (ARCHITECTURE §7, §5.8). */
  full: boolean;
  account: { id: string; name: string; avatarVersion: number | null; unverified: boolean };
  team: { id: string; name: string; tag: string; logo: TeamLogoInfo | null } | null;
  /** The team query failed: a neutral entry instead of claiming there is no team. */
  teamUnavailable: boolean;
};

type Entry = {
  key: string;
  href: string;
  label: string;
  sub?: string;
  /** Path sections that count as this entry, e.g. request pages as Scrims. */
  sections: string[];
  leading: ReactNode;
  dot?: boolean;
};

function entries(nav: AppNavData) {
  const account: Entry = {
    key: "account",
    href: "/account",
    label: nav.account.name,
    sub: "Konto",
    sections: ["/account", "/verify"],
    leading: <UserAvatar user={nav.account} className="size-8 text-[10px]" />,
    dot: nav.account.unverified,
  };
  if (!nav.full) return { top: [], bottom: [account] };
  const team: Entry = {
    key: "team",
    href: "/team",
    label: nav.team?.name ?? "Team",
    sub: nav.team ? "Team" : nav.teamUnavailable ? undefined : "Gründen oder beitreten",
    sections: ["/team", "/join"],
    leading: nav.team ? (
      <TeamAvatar team={nav.team} size="sm" own className="size-8 rounded-[7px] text-[9px]" />
    ) : (
      <span className="flex size-8 items-center justify-center rounded-[7px] border border-border font-label text-[11px]">
        {nav.teamUnavailable ? <UsersIcon size={15} /> : "?"}
      </span>
    ),
  };
  const scrims: Entry = {
    key: "scrims",
    href: "/scrims",
    label: "Scrims",
    sections: ["/scrims", "/requests"],
    leading: <LayersIcon size={17} />,
  };
  return { top: [scrims], bottom: [team, account] };
}

function isActive(entry: Entry, pathname: string): boolean {
  const section = `/${pathname.split("/")[1] ?? ""}`;
  return entry.sections.includes(section);
}

function EntryLink({
  entry,
  pathname,
  className,
  onClick,
}: {
  entry: Entry;
  pathname: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <SidebarLink
      href={entry.href}
      active={isActive(entry, pathname)}
      leading={entry.leading}
      label={entry.label}
      sub={entry.sub}
      trailing={entry.dot ? <WarningDot /> : undefined}
      className={className}
      onClick={onClick}
    />
  );
}

/** From 1024 px: Scrims on top, Team and Konto at the bottom (SidebarFrame). */
export function AppSidebar({ nav }: { nav: AppNavData }) {
  const pathname = usePathname();
  const { top, bottom } = entries(nav);
  return (
    <SidebarFrame
      top={
        top.length > 0 ? (
          <nav aria-label="Hauptmenü" className="flex flex-col gap-0.5">
            {top.map((entry) => (
              <EntryLink key={entry.key} entry={entry} pathname={pathname} />
            ))}
          </nav>
        ) : null
      }
      bottom={
        <nav aria-label="Team und Konto" className="flex flex-col gap-1">
          {bottom.map((entry) => (
            <EntryLink key={entry.key} entry={entry} pathname={pathname} />
          ))}
        </nav>
      }
    />
  );
}

/** Below 1024 px: the menu button opens the same entries in the same order. */
export function MobileMenu({ nav }: { nav: AppNavData }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  const { top, bottom } = entries(nav);
  const itemClass = "min-h-14 px-3.5 text-[16px]";
  // Without ADMIN_URL the admin area has its own sidebar and none of the site (§5.15): there the
  // menu button stays on desktops too.
  const desktop = pathname === "/admin" || pathname.startsWith("/admin/") ? "" : "lg:hidden";

  return (
    <>
      <button
        type="button"
        aria-label="Menü"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpenOn(open ? null : pathname)}
        className={cn(
          "flex size-11 cursor-pointer items-center justify-center rounded-sm border border-border bg-card text-foreground",
          desktop,
        )}
      >
        {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>
      {open ? (
        <div
          id="mobile-menu"
          className={cn(
            "absolute inset-x-0 top-16 flex flex-col gap-1 border-b border-border bg-background px-5 pt-2 pb-5 shadow-(--shadow-overlay)",
            desktop,
          )}
        >
          {top.length > 0 ? (
            <>
              <nav aria-label="Hauptmenü" className="flex flex-col gap-1">
                {top.map((entry) => (
                  <EntryLink
                    key={entry.key}
                    entry={entry}
                    pathname={pathname}
                    className={itemClass}
                    onClick={close}
                  />
                ))}
              </nav>
              <div className="my-2 h-px bg-border" />
            </>
          ) : null}
          <nav aria-label="Team und Konto" className="flex flex-col gap-1">
            {bottom.map((entry) => (
              <EntryLink
                key={entry.key}
                entry={entry}
                pathname={pathname}
                className={itemClass}
                onClick={close}
              />
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}
