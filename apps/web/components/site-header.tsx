import type { ThemePreference } from "@uni-scrims/db";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { DiscordBanner } from "@/components/discord-banner";
import { MobileMenu } from "@/components/app-nav";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LogoutButton } from "@/components/logout-button";
import { NotificationBell } from "@/components/notification-bell";
import { headerMessages } from "@/i18n/chrome";
import { mainUrl } from "@/lib/admin-url";
import { DEFAULT_AFTER_LOGIN } from "@/lib/callback-url";
import { inboxUnread, siteChrome, siteNav } from "@/lib/header-user";
import { getMessages } from "@/lib/locale";
import { realtimePublicUrl } from "@/lib/realtime/config";
import { loginUrl } from "@/lib/session";
import { cn } from "@/lib/utils";

async function Logo({
  href,
  theme,
  admin = false,
  compact = false,
}: {
  href: string;
  theme: ThemePreference;
  admin?: boolean;
  /** With the bell (SPEC N-32) there are three controls on the right: the icon below 400 px. */
  compact?: boolean;
}) {
  const t = await getMessages(headerMessages);
  return (
    // gap-3: the clear space of BRAND.md, one chevron arm of the 28 px logo.
    <Link href={href} className="flex items-center gap-3 text-foreground">
      {admin ? (
        // Three more controls on the right (language, §5.21): on phones only the icon (BRAND.md).
        <>
          <BrandLogo theme={theme} className="max-[480px]:hidden" />
          <BrandLogo variant="icon" theme={theme} className="min-[480px]:hidden" />
          {/* With the bell (§5.35) four controls: below 400 px only the icon. */}
          <span
            className={cn(
              "type-label leading-none text-muted-foreground",
              compact && "max-[400px]:hidden",
            )}
          >
            {t.admin}
          </span>
        </>
      ) : compact ? (
        <>
          <BrandLogo theme={theme} className="max-[400px]:hidden" />
          <BrandLogo variant="icon" theme={theme} className="min-[400px]:hidden" />
        </>
      ) : (
        <BrandLogo theme={theme} />
      )}
    </Link>
  );
}

/**
 * Header of the admin host (§5.13): no player navigation and no Discord banner. Full width like the
 * dashboard (§5.14, §5.15); from 1024 px the sidebar holds the logout, where a page has one.
 */
async function AdminHeader({ signedIn, theme }: { signedIn: boolean; theme: ThemePreference }) {
  const t = await getMessages(headerMessages);
  // The same bell as on the site, with the cases for staff (Phase 37, §5.35).
  const unread = await inboxUnread();
  return (
    // Sticky like the header of the site, so the sidebar sits below it either way (§5.14).
    <header className="sticky top-0 z-30 border-b border-border bg-background">
      <div className="flex h-16 items-center justify-between gap-3 px-5 max-[359px]:gap-2 sm:px-8">
        <Logo href="/" theme={theme} admin compact={unread !== null} />
        <div className="flex items-center gap-1 max-[359px]:gap-0">
          {unread !== null ? (
            <NotificationBell
              initialUnread={unread}
              realtimeUrl={realtimePublicUrl()}
              className="mr-1 size-9 max-[359px]:mr-0.5"
            />
          ) : null}
          <LocaleSwitcher compact className="mr-1 h-9 max-[359px]:mr-0.5" />
          <a
            href={mainUrl("/scrims")}
            className="type-btn flex h-9 items-center px-2.5 text-[14px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground max-[359px]:px-1.5"
          >
            {t.toSite}
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
  const theme = user?.theme ?? "SYSTEM";
  if (adminHost) return <AdminHeader signedIn={user !== null} theme={theme} />;
  const showBanner = user !== null && (user.hubJoinFailedAt !== null || user.dmFailedAt !== null);
  // The navigation is the sidebar from 1024 px and the menu below (§5.15). Signed in, the header is
  // full width with the logo above the sidebar.
  const [nav, unread] = await Promise.all([siteNav(), inboxUnread()]);
  const t = await getMessages(headerMessages);

  return (
    <>
      <header className={cn("border-b border-border bg-background", user && "sticky top-0 z-30")}>
        <div
          className={cn(
            "flex h-16 items-center justify-between gap-3 px-5 sm:px-8",
            // Signed out the column of the page; the landing page is wider (data-landing, §7).
            !user &&
              "mx-auto max-w-3xl [body:has([data-landing])_&]:max-w-[1120px] sm:[body:has([data-landing])_&]:px-5",
          )}
        >
          <Logo href={active ? "/scrims" : "/"} theme={theme} compact={unread !== null} />
          {/* The language at the top right (§5.21); signed in, left of the menu button below 1024 px. */}
          <div className="flex items-center gap-2">
            {/* The bell left of the language (SPEC N-32). */}
            {unread !== null ? (
              <NotificationBell initialUnread={unread} realtimeUrl={realtimePublicUrl()} />
            ) : null}
            <LocaleSwitcher className="h-11" />
            {nav ? <MobileMenu nav={nav} /> : null}
            {user ? null : (
              // Only on the landing page, from 375 px (below, the logo needs the room; the hero has
              // the same link right below).
              <Link
                href={loginUrl(DEFAULT_AFTER_LOGIN)}
                className="type-btn hidden h-9 items-center rounded-sm border border-border-strong px-3 text-[13px] font-semibold whitespace-nowrap text-muted-foreground hover:border-muted-foreground hover:text-foreground min-[375px]:[body:has([data-landing])_&]:flex"
              >
                {t.signIn}
              </Link>
            )}
          </div>
        </div>
      </header>
      {showBanner ? <DiscordBanner /> : null}
    </>
  );
}
