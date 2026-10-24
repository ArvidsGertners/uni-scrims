import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One entry of a sidebar (§5.14, §5.15): symbol or avatar in front, label with an optional second
 * line, something at the end (count, warning dot). For the site and the admin area alike.
 */
export function SidebarLink({
  href,
  active,
  leading,
  label,
  sub,
  trailing,
  className,
  onClick,
}: {
  href: string;
  active: boolean;
  leading?: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "type-btn flex min-h-10 items-center gap-2.5 rounded-sm px-3 py-1.5 text-[14px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground",
        active && "bg-secondary text-foreground",
        className,
      )}
    >
      {/* Icons, avatars and initials are decoration; the label names the entry. */}
      {leading ? (
        <span aria-hidden className="flex shrink-0">
          {leading}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {sub ? (
          <span className="truncate text-[12px] font-normal text-muted-foreground">{sub}</span>
        ) : null}
      </span>
      {trailing}
    </Link>
  );
}
