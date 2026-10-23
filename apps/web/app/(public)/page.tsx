import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSignedInUser } from "@/lib/session";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gesperrt, geloescht } = await searchParams;
  const loggedIn = (await getSignedInUser()) !== null;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl font-bold">Uni Scrims</h1>
      <p>
        Scrims für Valorant-Teams deutscher Hochschulen. Nur für Studierende mit geprüfter
        Immatrikulationsbescheinigung.
      </p>
      {geloescht ? <p>Dein Konto wurde gelöscht.</p> : null}
      {gesperrt ? (
        <p className="text-destructive">
          Dein Konto ist gesperrt. Du kannst es unter{" "}
          <Link href="/account" className="underline">
            Konto
          </Link>{" "}
          löschen.
        </p>
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
