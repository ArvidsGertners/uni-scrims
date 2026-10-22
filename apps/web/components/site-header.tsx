import { getCurrentUser } from "@uni-scrims/core";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { DiscordBanner } from "@/components/discord-banner";
import { LogoutButton } from "@/components/logout-button";
import { getSessionUserId } from "@/lib/session";

/** The signed-in user, or null; also null if the database is down, so legal pages still render. */
async function headerUser() {
  try {
    const userId = await getSessionUserId();
    return userId ? await getCurrentUser(userId) : null;
  } catch (error) {
    // Next signals dynamic rendering and redirects by throwing; those must pass.
    unstable_rethrow(error);
    console.error("Could not load the user for the header", error);
    return null;
  }
}

export async function SiteHeader() {
  const user = await headerUser();
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
        {/* Also for banned users: they may delete their account (ARCHITECTURE §7). */}
        {user ? <Link href="/account">Konto</Link> : null}
        <span className="ml-auto" />
        {user ? <LogoutButton /> : <Link href="/login">Anmelden</Link>}
      </nav>
      {showBanner ? <DiscordBanner /> : null}
    </header>
  );
}
