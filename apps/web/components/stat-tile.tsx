import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";

const tileClass = "flex flex-col gap-1.5 rounded-lg border border-border bg-card p-5";

/**
 * Dashboard tile (§5.14): label, a large value and a line below; the whole tile links when `href`
 * is given. For the admin overview and the team page.
 */
export function StatTile({
  href,
  label,
  value,
  tone,
  valueClassName,
  className,
  children,
}: {
  href?: string;
  label: ReactNode;
  value: ReactNode;
  /** Colour of the value, e.g. text-warning while something waits. */
  tone?: string;
  valueClassName?: string;
  className?: string;
  /** The line below the value, if any. */
  children?: ReactNode;
}) {
  const content = (
    <>
      <span className="type-label text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display text-[36px] leading-tight [font-weight:var(--display-weight)]",
          tone,
          valueClassName,
        )}
      >
        {value}
      </span>
      {children != null ? (
        <span className="text-[13px] text-pretty text-muted-foreground">{children}</span>
      ) : null}
    </>
  );
  return href ? (
    <Link
      href={href}
      className={cn(tileClass, "hover:border-border-strong hover:bg-secondary", className)}
    >
      {content}
    </Link>
  ) : (
    <div className={cn(tileClass, className)}>{content}</div>
  );
}
