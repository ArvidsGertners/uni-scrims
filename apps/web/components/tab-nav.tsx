import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";

export type TabNavItem = {
  href: string;
  label: string;
  active: boolean;
  /** After the label, e.g. a count or a warning dot. */
  trailing?: ReactNode;
};

/**
 * Sub pages as tabs at the top of the content (§5.15), swipeable when they do not fit: Scrims,
 * Konto and the admin area on phones.
 */
export function TabNav({ label, items }: { label: string; items: TabNavItem[] }) {
  return (
    <nav
      aria-label={label}
      className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "type-btn flex min-h-10 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-sm px-3 text-[14px] font-semibold whitespace-nowrap text-muted-foreground",
            item.active && "bg-secondary text-foreground",
          )}
        >
          {item.label}
          {item.trailing}
        </Link>
      ))}
    </nav>
  );
}
