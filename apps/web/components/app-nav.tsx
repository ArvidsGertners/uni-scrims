"use client";

import type { TeamLogoInfo } from "@uni-scrims/core";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { LayersIcon, MenuIcon, XIcon } from "@/components/icons";
import { SidebarLink } from "@/components/sidebar-link";
import { TeamAvatar } from "@/components/team-avatar";
import { UserAvatar } from "@/components/user-avatar";

/** What the navigation of the site shows (§5.15), from siteChrome. */
export type AppNavData = {
  /** Banned users and incomplete accounts only get Konto (ARCHITECTURE §7, §5.8). */
  full: boolean;
  account: { id: string; name: string; avatarVersion: number | null; unverified: boolean };
  team: { id: string; name: string; tag: string; logo: TeamLogoInfo | null } | null;
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
    sub: nav.team ? "Team" : "Gründen oder beitreten",
    sections: ["/team", "/join"],
    leading: nav.team ? (
      <TeamAvatar team={nav.team} size="sm" own className="size-8 rounded-[7px] text-[9px]" />
    ) : (
      <span className="flex size-8 items-center justify-center rounded-[7px] border border-border font-label text-[11px]">
        ?
      </span>
    ),
  };
  const scrims: Entry = {
    key: "scrims",
    href: "/scrims",
    label: "Scrims",
    sections: ["/scrims", "/requests", "/board"],
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
      trailing={
        entry.dot ? (
          <span aria-label="Nicht verifiziert" className="size-1.5 rounded-full bg-warning" />
        ) : undefined
      }
      className={className}
      onClick={onClick}
    />
  );
}

/** From 1024 px: Scrims on top, Team and Konto at the bottom, below the sticky header. */
export function AppSidebar({ nav }: { nav: AppNavData }) {
  const pathname = usePathname();
  const { top, bottom } = entries(nav);
  return (
    <div className="sticky top-[5.75rem] flex h-[calc(100dvh-7.5rem)] min-h-[320px] flex-col gap-6">
      <nav aria-label="Hauptmenü" className="flex flex-col gap-0.5">
        {top.map((entry) => (
          <EntryLink key={entry.key} entry={entry} pathname={pathname} />
        ))}
      </nav>
      <nav
        aria-label="Team und Konto"
        className="mt-auto flex flex-col gap-1 border-t border-border pt-4"
      >
        {bottom.map((entry) => (
          <EntryLink key={entry.key} entry={entry} pathname={pathname} />
        ))}
      </nav>
    </div>
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

  return (
    <>
      <button
        type="button"
        aria-label="Menü"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpenOn(open ? null : pathname)}
        className="flex size-11 cursor-pointer items-center justify-center rounded-sm border border-border bg-card text-foreground lg:hidden"
      >
        {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>
      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-16 flex flex-col gap-1 border-b border-border bg-background px-5 pt-2 pb-5 shadow-(--shadow-overlay) lg:hidden"
        >
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
          {top.length > 0 ? <div className="my-2 h-px bg-border" /> : null}
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
