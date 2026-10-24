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

/** Path sections that count as Konto (§5.16). */
const ACCOUNT_SECTIONS = ["/account", "/verify", "/support"];

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

/** Konto as a menu from 1024 px (§5.16): settings, support, admin area, logout; opens upwards. */
function AccountMenu({ nav, active }: { nav: AppNavData; active: boolean }) {
  const logout = useLogout();
  return (
    <MenuRoot>
      <MenuTrigger className={sidebarEntryClass(active, "group w-full cursor-pointer text-left")}>
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
        <MenuLinkItem render={<Link href="/account" />}>Einstellungen</MenuLinkItem>
        <MenuLinkItem render={<Link href="/support" />}>Support</MenuLinkItem>
        {nav.adminUrl ? (
          <MenuLinkItem href={nav.adminUrl}>
            <span className="flex-1">Admin-Bereich</span>
            <ExternalLinkIcon size={15} className="text-muted-foreground" />
          </MenuLinkItem>
        ) : null}
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
              <SidebarLink
                key={entry.key}
                href={entry.href}
                active={inSection(entry.sections, pathname)}
                leading={entry.leading}
                label={entry.label}
                sub={entry.sub}
              />
            ))}
          </nav>
        ) : null
      }
      bottom={
        <nav aria-label="Team und Konto" className="flex flex-col gap-1">
          {team ? (
            <SidebarLink
              href={team.href}
              active={inSection(team.sections, pathname)}
              leading={team.leading}
              label={team.label}
              sub={team.sub}
            />
          ) : null}
          <AccountMenu nav={nav} active={inSection(ACCOUNT_SECTIONS, pathname)} />
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
                  <SidebarLink
                    key={entry.key}
                    href={entry.href}
                    active={inSection(entry.sections, pathname)}
                    leading={entry.leading}
                    label={entry.label}
                    sub={entry.sub}
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
              <SidebarLink
                href={team.href}
                active={inSection(team.sections, pathname)}
                leading={team.leading}
                label={team.label}
                sub={team.sub}
                className={itemClass}
                onClick={close}
              />
            ) : null}
            {/* The account as a heading with the items of the account menu below (§5.16). */}
            <div className={sidebarEntryClass(false, cn(itemClass, "hover:bg-transparent"))}>
              <AccountContent nav={nav} />
            </div>
            <SidebarLink
              href="/account"
              active={inSection(["/account", "/verify"], pathname)}
              label="Einstellungen"
              className={subItemClass}
              onClick={close}
            />
            <SidebarLink
              href="/support"
              active={inSection(["/support"], pathname)}
              label="Support"
              className={subItemClass}
              onClick={close}
            />
            {nav.adminUrl ? (
              <SidebarLink
                href={nav.adminUrl}
                active={false}
                label="Admin-Bereich"
                trailing={<ExternalLinkIcon size={15} className="text-muted-foreground" />}
                className={subItemClass}
                onClick={close}
              />
            ) : null}
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
