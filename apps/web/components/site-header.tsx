import Link from "next/link";
import { DiscordBanner } from "@/components/discord-banner";
import { HeaderNav, type NavItem } from "@/components/header-nav";
import { headerUser } from "@/lib/header-user";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const user = await headerUser();
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
          <Link
            href={active ? "/scrims" : "/"}
            className="flex items-center gap-2.5 text-foreground"
          >
            <span aria-hidden className="h-5 w-2.5 -skew-x-14 bg-primary" />
            <span className="font-display text-[18px] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase">
              Uni Scrims
            </span>
          </Link>
          {user ? <HeaderNav items={items} /> : null}
        </div>
      </header>
      {showBanner ? <DiscordBanner /> : null}
    </>
  );
}
