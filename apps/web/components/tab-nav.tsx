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

const barClass = "flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1";

function tabClass(active: boolean): string {
  return cn(
    "type-btn flex min-h-10 flex-[1_0_auto] items-center justify-center gap-1.5 rounded-sm px-3 text-[14px] font-semibold whitespace-nowrap text-muted-foreground",
    active && "bg-secondary text-foreground",
  );
}

/**
 * Sub pages as tabs at the top of the content (§5.15), swipeable when they do not fit: Scrims,
 * Konto and the admin area on phones. `preview` draws the same tabs without links, for the
 * board preview on the landing page.
 */
export function TabNav({
  label,
  items,
  preview = false,
}: {
  label: string;
  items: TabNavItem[];
  preview?: boolean;
}) {
  if (preview) {
    return (
      <div className={barClass}>
        {items.map((item) => (
          <span key={item.href} className={tabClass(item.active)}>
            {item.label}
            {item.trailing}
          </span>
        ))}
      </div>
    );
  }
  return (
    <nav aria-label={label} className={barClass}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={tabClass(item.active)}
        >
          {item.label}
          {item.trailing}
        </Link>
      ))}
    </nav>
  );
}
