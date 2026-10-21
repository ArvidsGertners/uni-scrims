import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUserId } from "@/lib/session";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gesperrt } = await searchParams;
  const loggedIn = (await getSessionUserId()) !== null;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">Uni Scrims</h1>
      <p>
        Scrims für Valorant-Teams deutscher Hochschulen. Nur für Studierende mit geprüfter
        Immatrikulationsbescheinigung.
      </p>
      {gesperrt ? (
        <p className="text-destructive">Dein Konto ist gesperrt.</p>
      ) : loggedIn ? (
        <Link href="/team" className={buttonVariants({ className: "self-start" })}>
          Zu deinem Team
        </Link>
      ) : (
        <Link href="/login" className={buttonVariants({ className: "self-start" })}>
          Anmelden
        </Link>
      )}
    </main>
  );
}
