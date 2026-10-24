"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MenuIcon, XIcon } from "@/components/icons";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  /** Warning dot, e.g. on "Konto" while the user is not verified. */
  dot?: boolean;
  /** The own avatar in front of the label, on "Konto" (§5.14). */
  avatar?: { id: string; name: string; avatarVersion: number | null };
};

// Request detail and create count as Scrims (design README); the scrim page with the feedback form
// lives under /scrims already. The verification belongs to Konto (§5.13).
const SECTION_ALIASES: Record<string, string> = { "/requests": "/scrims", "/verify": "/account" };

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
              {item.avatar ? <UserAvatar user={item.avatar} className="size-6 text-[9px]" /> : null}
              {item.label}
              {item.dot ? <span className="size-1.5 rounded-full bg-warning" /> : null}
              {active ? (
                <span className="absolute inset-x-2.5 -bottom-px h-0.5 bg-primary" />
              ) : null}
            </Link>
          );
        })}
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
                  {item.avatar ? (
                    <UserAvatar user={item.avatar} className="size-7 text-[10px]" />
                  ) : null}
                  {item.label}
                  {item.dot ? <span className="size-[7px] rounded-full bg-warning" /> : null}
                </span>
                {active ? <span className="size-2 bg-primary" /> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
