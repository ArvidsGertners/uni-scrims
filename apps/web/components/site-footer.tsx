import Link from "next/link";
import { siteChrome } from "@/lib/header-user";
import { cn } from "@/lib/utils";

export async function SiteFooter() {
  // As wide as the sidebar frame where there is one (§5.14, §5.15).
  const { user, adminHost } = await siteChrome();
  const wide = user !== null || adminHost;
  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          "mx-auto flex flex-wrap justify-between gap-x-6 gap-y-3 px-5 pt-6 pb-8 text-[13px] text-faint sm:px-8",
          wide ? "max-w-6xl" : "max-w-3xl",
        )}
      >
        <div className="flex gap-5">
          <Link href="/impressum" className="text-muted-foreground hover:text-foreground">
            Impressum
          </Link>
          <Link href="/datenschutz" className="text-muted-foreground hover:text-foreground">
            Datenschutz
          </Link>
        </div>
        <span>Kein offizielles Produkt von Riot Games.</span>
      </div>
    </footer>
  );
}
