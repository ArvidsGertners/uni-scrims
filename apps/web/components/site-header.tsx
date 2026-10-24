import { headers } from "next/headers";
import Link from "next/link";
import { DiscordBanner } from "@/components/discord-banner";
import { HeaderNav, type NavItem } from "@/components/header-nav";
import { LogoutButton } from "@/components/logout-button";
import { isAdminHost, mainUrl } from "@/lib/admin-url";
import { headerUser } from "@/lib/header-user";
import { cn } from "@/lib/utils";

function Logo({ href, admin = false }: { href: string; admin?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-foreground">
      <span aria-hidden className="h-5 w-2.5 -skew-x-14 bg-primary" />
      <span className="font-display text-[18px] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase">
        Uni Scrims
      </span>
      {/* The admin header has two more controls; small phones drop the label (§5.13). */}
      {admin ? (
        <span className="type-label text-muted-foreground max-[399px]:hidden">Admin</span>
      ) : null}
    </Link>
  );
}

/** Header of the admin host (§5.13): no player navigation and no Discord banner. */
function AdminHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5 sm:px-8">
        <Logo href="/" admin />
        <div className="flex items-center gap-1">
          <a
            href={mainUrl("/scrims")}
            className="type-btn flex h-9 items-center px-2.5 text-[14px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground max-[359px]:hidden"
          >
            Zur Seite
          </a>
          {signedIn ? (
            <LogoutButton
              redirectTo={mainUrl("/")}
              className="type-btn ml-1 h-9 cursor-pointer rounded-sm border border-border-strong px-3 text-[13px] font-semibold whitespace-nowrap text-muted-foreground hover:border-muted-foreground hover:text-foreground"
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}

export async function SiteHeader() {
  const user = await headerUser();
  if (isAdminHost((await headers()).get("host"))) return <AdminHeader signedIn={user !== null} />;
  const showBanner = user !== null && (user.hubJoinFailedAt !== null || user.dmFailedAt !== null);
  const active = user !== null && !user.bannedAt && !user.setupStep;

  // Banned users and incomplete accounts only get Konto: there they may delete their account or
  // finish its setup (ARCHITECTURE §7, §5.8). Verification and logout live under Konto, the admin
  // area on its own address (§5.13).
  const items: NavItem[] = active
    ? [
        { href: "/scrims", label: "Scrims" },
        { href: "/team", label: "Team" },
        { href: "/account", label: "Konto", dot: !user.verifiedAt },
      ]
    : [{ href: "/account", label: "Konto" }];

  return (
    <>
      <header className={cn("border-b border-border bg-background", user && "sticky top-0 z-30")}>
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5 sm:px-8">
          <Logo href={active ? "/scrims" : "/"} />
          {user ? <HeaderNav items={items} /> : null}
        </div>
      </header>
      {showBanner ? <DiscordBanner /> : null}
    </>
  );
}
