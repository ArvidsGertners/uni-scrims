import { headers } from "next/headers";
import Link from "next/link";
import { DiscordBanner } from "@/components/discord-banner";
import { HeaderNav, type NavItem } from "@/components/header-nav";
import { LogoutButton } from "@/components/logout-button";
import { isAdminHost, mainUrl } from "@/lib/admin-url";
import { headerUser } from "@/lib/header-user";
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

/** Header of the admin host (§5.13): no player navigation and no Discord banner. */
function AdminHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5 max-[359px]:gap-2 sm:px-8">
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
              className="type-btn ml-1 h-9 cursor-pointer rounded-sm border border-border-strong px-3 text-[13px] font-semibold whitespace-nowrap text-muted-foreground hover:border-muted-foreground hover:text-foreground max-[359px]:ml-0 max-[359px]:px-2"
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
  const avatar = user
    ? { id: user.id, name: user.name, avatarVersion: user.avatarVersion }
    : undefined;
  const items: NavItem[] = active
    ? [
        { href: "/scrims", label: "Scrims" },
        { href: "/team", label: "Team" },
        { href: "/account", label: "Konto", dot: !user.verifiedAt, avatar },
      ]
    : [{ href: "/account", label: "Konto", avatar }];

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
