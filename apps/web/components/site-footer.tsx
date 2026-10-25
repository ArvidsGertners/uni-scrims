import Link from "next/link";
import { footerMessages } from "@/i18n/chrome";
import { siteChrome } from "@/lib/header-user";
import { getMessages } from "@/lib/locale";
import { cn } from "@/lib/utils";

export async function SiteFooter() {
  // Full width where there is a sidebar (§5.14, §5.15), narrow like the pages elsewhere.
  const { user, adminHost } = await siteChrome();
  const t = await getMessages(footerMessages);
  const wide = user !== null || adminHost;
  return (
    <footer className="border-t border-border">
      <div
        className={cn(
          "flex flex-wrap justify-between gap-x-6 gap-y-3 px-5 pt-6 pb-8 text-[13px] text-faint sm:px-8",
          // The landing page is wider (data-landing, §7).
          !wide &&
            "mx-auto max-w-3xl [body:has([data-landing])_&]:max-w-[1120px] sm:[body:has([data-landing])_&]:px-5",
        )}
      >
        <div className="flex gap-5">
          <Link href="/impressum" className="text-muted-foreground hover:text-foreground">
            {t.impressum}
          </Link>
          <Link href="/datenschutz" className="text-muted-foreground hover:text-foreground">
            {t.privacy}
          </Link>
          {/* For everyone, also when signing in does not work (SPEC N-13). */}
          <Link href="/support" className="text-muted-foreground hover:text-foreground">
            {t.support}
          </Link>
        </div>
      </div>
    </footer>
  );
}
