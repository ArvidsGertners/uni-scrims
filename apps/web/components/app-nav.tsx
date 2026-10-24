"use client";

import type { TeamLogoInfo } from "@uni-scrims/core";
import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  LayersIcon,
  MenuIcon,
  UsersIcon,
  XIcon,
} from "@/components/icons";
import { useLogout } from "@/components/logout-button";
import { SidebarFrame } from "@/components/sidebar-frame";
import { SidebarEntryContent, SidebarLink, sidebarEntryClass } from "@/components/sidebar-link";
import { TeamAvatar } from "@/components/team-avatar";
import {
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
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
  /** The admin area for staff with an active account (§5.16), else null. */
  adminUrl: string | null;
};

type Entry = {
  key: string;
  href: string;
  label: string;
  sub?: string;
  /** Path sections that count as this entry, e.g. request pages as Scrims. */
  sections: string[];
  leading: ReactNode;
};

/** The items of the account menu before Abmelden (§5.16), for both navigations. */
type AccountItem = {
  key: string;
  href: string;
  label: string;
  sections: string[];
  /** Another host or area: a plain link with a full page load. */
  external?: boolean;
};

function inSection(sections: string[], pathname: string): boolean {
  return sections.includes(`/${pathname.split("/")[1] ?? ""}`);
}

function entries(nav: AppNavData) {
  if (!nav.full) return { top: [], team: null };
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
  return { top: [scrims], team };
}

function accountItems(nav: AppNavData): AccountItem[] {
  return [
    {
      key: "settings",
      href: "/account",
      label: "Einstellungen",
      sections: ["/account", "/verify"],
    },
    { key: "support", href: "/support", label: "Support", sections: ["/support"] },
    ...(nav.adminUrl
      ? [{ key: "admin", href: nav.adminUrl, label: "Admin-Bereich", sections: [], external: true }]
      : []),
  ];
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
      active={inSection(entry.sections, pathname)}
      leading={entry.leading}
      label={entry.label}
      sub={entry.sub}
      className={className}
      onClick={onClick}
    />
  );
}

/** Profile picture, name and "Konto" with the warning dot: the account in both navigations. */
function AccountContent({ nav, trailing }: { nav: AppNavData; trailing?: ReactNode }) {
  return (
    <SidebarEntryContent
      leading={<UserAvatar user={nav.account} className="size-8 text-[10px]" />}
      label={nav.account.name}
      sub="Konto"
      trailing={
        <>
          {nav.account.unverified ? <WarningDot /> : null}
          {trailing}
        </>
      }
    />
  );
}

const externalIcon = <ExternalLinkIcon size={15} className="text-muted-foreground" />;

/** Konto as a menu from 1024 px (§5.16): settings, support, admin area, logout; opens upwards. */
function AccountMenu({ nav, pathname }: { nav: AppNavData; pathname: string }) {
  const logout = useLogout();
  const items = accountItems(nav);
  const active = items.some((item) => inSection(item.sections, pathname));
  return (
    <MenuRoot>
      <MenuTrigger
        aria-current={active ? "page" : undefined}
        className={sidebarEntryClass(active, "group w-full cursor-pointer text-left")}
      >
        <AccountContent
          nav={nav}
          trailing={
            <ChevronDownIcon
              size={16}
              className="shrink-0 rotate-180 transition-transform group-data-popup-open:rotate-0"
            />
          }
        />
      </MenuTrigger>
      <MenuPopup side="top">
        {items.map((item) =>
          item.external ? (
            <MenuLinkItem key={item.key} href={item.href}>
              <span className="flex-1">{item.label}</span>
              {externalIcon}
            </MenuLinkItem>
          ) : (
            <MenuLinkItem key={item.key} render={<Link href={item.href} />}>
              {item.label}
            </MenuLinkItem>
          ),
        )}
        <MenuSeparator />
        <MenuItem onClick={logout}>Abmelden</MenuItem>
      </MenuPopup>
    </MenuRoot>
  );
}

/** From 1024 px: Scrims on top, Team and Konto at the bottom (SidebarFrame). */
export function AppSidebar({ nav }: { nav: AppNavData }) {
  const pathname = usePathname();
  const { top, team } = entries(nav);
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
          {team ? <EntryLink entry={team} pathname={pathname} /> : null}
          <AccountMenu nav={nav} pathname={pathname} />
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
  const logout = useLogout();
  const { top, team } = entries(nav);
  const itemClass = "min-h-14 px-3.5 text-[16px]";
  const subItemClass = "min-h-12 pl-[3.25rem] text-[15px]";
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
            "absolute inset-x-0 top-16 flex max-h-[calc(100dvh-4rem)] flex-col gap-1 overflow-y-auto border-b border-border bg-background px-5 pt-2 pb-5 shadow-(--shadow-overlay)",
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
            {team ? (
              <EntryLink entry={team} pathname={pathname} className={itemClass} onClick={close} />
            ) : null}
            {/* The account as the heading of the items of the account menu (§5.16). */}
            <div
              role="heading"
              aria-level={2}
              className="flex min-h-14 items-center gap-2.5 px-3.5 py-1.5 text-[16px] font-semibold text-foreground"
            >
              <AccountContent nav={nav} />
            </div>
            {accountItems(nav).map((item) =>
              item.external ? (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={close}
                  className={sidebarEntryClass(false, subItemClass)}
                >
                  <SidebarEntryContent label={item.label} trailing={externalIcon} />
                </a>
              ) : (
                <SidebarLink
                  key={item.key}
                  href={item.href}
                  active={inSection(item.sections, pathname)}
                  label={item.label}
                  className={subItemClass}
                  onClick={close}
                />
              ),
            )}
            <button
              type="button"
              onClick={() => {
                close();
                void logout();
              }}
              className={sidebarEntryClass(
                false,
                cn(subItemClass, "w-full cursor-pointer text-left"),
              )}
            >
              Abmelden
            </button>
          </nav>
        </div>
      ) : null}
    </>
  );
}
