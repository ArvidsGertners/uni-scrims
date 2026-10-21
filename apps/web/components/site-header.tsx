import { getCurrentUser } from "@uni-scrims/core";
import Link from "next/link";
import { DiscordBanner } from "@/components/discord-banner";
import { LogoutButton } from "@/components/logout-button";
import { getSessionUserId } from "@/lib/session";

export async function SiteHeader() {
  const userId = await getSessionUserId();
  const user = userId ? await getCurrentUser(userId) : null;
  const showBanner = user !== null && (user.hubJoinFailedAt !== null || user.dmFailedAt !== null);

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="font-bold">
          Uni Scrims
        </Link>
        {user && !user.bannedAt ? (
          <>
            <Link href="/board">Board</Link>
            <Link href="/scrims">Meine Scrims</Link>
            <Link href="/team">Team</Link>
            <Link href="/verify">Verifizierung</Link>
            {user.isAdmin ? <Link href="/admin">Admin</Link> : null}
          </>
        ) : null}
        <span className="ml-auto" />
        {user ? <LogoutButton /> : <Link href="/login">Anmelden</Link>}
      </nav>
      {showBanner ? <DiscordBanner /> : null}
    </header>
  );
}
