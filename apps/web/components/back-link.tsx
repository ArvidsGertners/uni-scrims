import Link from "next/link";
import { ChevronLeftIcon } from "@/components/icons";

/** "Zurück zum Board" and the like (design handoff). */
export function BackLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1.5 self-start text-[14px] text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon strokeWidth={2.5} />
      {children}
    </Link>
  );
}
