import Link from "next/link";
import { siteChrome } from "@/lib/header-user";
import { cn } from "@/lib/utils";

export async function SiteFooter() {
  // Full width where there is a sidebar (§5.14, §5.15), narrow like the pages elsewhere.
  const { user, adminHost } = await siteChrome();
  const wide = user !== null || adminHost;
  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          "flex flex-wrap justify-between gap-x-6 gap-y-3 px-5 pt-6 pb-8 text-[13px] text-faint sm:px-8",
          !wide && "mx-auto max-w-3xl",
        )}
      >
        <div className="flex gap-5">
          <Link href="/impressum" className="text-muted-foreground hover:text-foreground">
            Impressum
          </Link>
          <Link href="/datenschutz" className="text-muted-foreground hover:text-foreground">
            Datenschutz
          </Link>
          {/* For everyone, also when signing in does not work (SPEC N-13). */}
          <Link href="/support" className="text-muted-foreground hover:text-foreground">
            Support
          </Link>
        </div>
        {/* Riot's "Legal Jibber Jabber" policy asks for this note, as the rank icons are Riot's
            assets (ARCHITECTURE §5.19). */}
        <span className="text-pretty">
          Uni Scrims wurde unter der „Legal Jibber Jabber“-Richtlinie von Riot Games mit Assets von
          Riot Games erstellt. Riot Games unterstützt oder sponsert dieses Projekt nicht.
        </span>
      </div>
    </footer>
  );
}
