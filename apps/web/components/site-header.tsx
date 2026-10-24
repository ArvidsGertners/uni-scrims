import Link from "next/link";
import { DiscordBanner } from "@/components/discord-banner";
import { MobileMenu } from "@/components/app-nav";
import { LogoutButton } from "@/components/logout-button";
import { mainUrl } from "@/lib/admin-url";
import { siteChrome, siteNav } from "@/lib/header-user";
import { cn } from "@/lib/utils";

const WORDMARK_CLASS =
  "font-display text-[18px] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase";

function Logo({ href, admin = false }: { href: string; admin?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-foreground">
      <span aria-hidden className="h-5 w-2.5 shrink-0 -skew-x-14 bg-primary" />
      {admin ? (
        // Two more controls on the right: on small phones the label goes below the wordmark.
        <span className="flex items-center gap-2.5 max-[399px]:flex-col max-[399px]:items-start max-[399px]:gap-0.5">
          <span className={cn(WORDMARK_CLASS, "max-[359px]:text-[16px]")}>Uni Scrims</span>
          <span className="type-label leading-none text-muted-foreground">Admin</span>
        </span>
      ) : (
        <span className={WORDMARK_CLASS}>Uni Scrims</span>
      )}
    </Link>
  );
}

/**
 * Header of the admin host (§5.13): no player navigation and no Discord banner. As wide as the
 * dashboard (§5.14); from 1024 px the sidebar holds the logout, where a page has one.
 */
function AdminHeader({ signedIn }: { signedIn: boolean }) {
  return (
    // Sticky like the header of the site, so the sidebar sits below it either way (§5.14).
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5 max-[359px]:gap-2 sm:px-8">
        <Logo href="/" admin />
        <div className="flex items-center gap-1 max-[359px]:gap-0">
          <a
            href={mainUrl("/scrims")}
            className="type-btn flex h-9 items-center px-2.5 text-[14px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground max-[359px]:px-1.5"
          >
            Zur Seite
          </a>
          {signedIn ? (
            <LogoutButton
              redirectTo={mainUrl("/")}
              className="type-btn ml-1 h-9 cursor-pointer rounded-sm border border-border-strong px-3 text-[13px] font-semibold whitespace-nowrap text-muted-foreground hover:border-muted-foreground hover:text-foreground max-[359px]:ml-0 max-[359px]:px-2 lg:[body:has([data-admin-sidebar])_&]:hidden"
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}

export async function SiteHeader() {
  const { user, active, adminHost } = await siteChrome();
  if (adminHost) return <AdminHeader signedIn={user !== null} />;
  const showBanner = user !== null && (user.hubJoinFailedAt !== null || user.dmFailedAt !== null);
  // The navigation is the sidebar from 1024 px and the menu below (§5.15).
  const nav = await siteNav();

  return (
    <>
      <header className={cn("border-b border-border bg-background", user && "sticky top-0 z-30")}>
        <div
          className={cn(
            "mx-auto flex h-16 items-center justify-between gap-3 px-5 sm:px-8",
            user ? "max-w-6xl" : "max-w-3xl",
          )}
        >
          <Logo href={active ? "/scrims" : "/"} />
          {nav ? <MobileMenu nav={nav} /> : null}
        </div>
      </header>
      {showBanner ? <DiscordBanner /> : null}
    </>
  );
}
