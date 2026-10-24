"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuIcon, XIcon } from "@/components/icons";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  /** Warning dot, e.g. on "Verifizierung" while the user is not verified. */
  dot?: boolean;
};

// Request detail and create count as Board (design README); the scrim page with the feedback form
// lives under /scrims already.
const SECTION_ALIASES: Record<string, string> = { "/requests": "/board" };

function isActive(href: string, pathname: string): boolean {
  const section = `/${pathname.split("/")[1] ?? ""}`;
  return (SECTION_ALIASES[section] ?? section) === href;
}

/** Desktop nav (≥ 768 px) and the mobile menu below the header. */
export function HeaderNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);

  return (
    <>
      <nav aria-label="Hauptmenü" className="hidden items-center gap-0.5 md:flex">
        {items.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "type-btn relative flex h-16 items-center gap-1.5 px-2.5 text-[14px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground",
                active && "text-foreground",
              )}
            >
              {item.label}
              {item.dot ? <span className="size-1.5 rounded-full bg-warning" /> : null}
              {active ? (
                <span className="absolute inset-x-2.5 -bottom-px h-0.5 bg-primary" />
              ) : null}
            </Link>
          );
        })}
        <LogoutButton className="type-btn ml-2 h-9 cursor-pointer rounded-sm border border-border-strong px-3 text-[13px] font-semibold whitespace-nowrap text-muted-foreground hover:border-muted-foreground hover:text-foreground" />
      </nav>

      <button
        type="button"
        aria-label="Menü"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpenOn(open ? null : pathname)}
        className="flex size-11 cursor-pointer items-center justify-center rounded-sm border border-border bg-card text-foreground md:hidden"
      >
        {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>
      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-16 flex flex-col border-b border-border bg-background px-5 pt-2 pb-5 shadow-(--shadow-overlay) md:hidden"
        >
          {items.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "type-btn flex h-14 items-center justify-between rounded-sm px-3.5 text-[17px] font-semibold text-muted-foreground",
                  active && "bg-card text-foreground",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {item.label}
                  {item.dot ? <span className="size-[7px] rounded-full bg-warning" /> : null}
                </span>
                {active ? <span className="size-2 bg-primary" /> : null}
              </Link>
            );
          })}
          <div className="my-2 h-px bg-border" />
          <LogoutButton className="flex h-[52px] cursor-pointer items-center px-3.5 text-left text-[16px] text-muted-foreground" />
        </div>
      ) : null}
    </>
  );
}
