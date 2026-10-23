import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isDevLoginEnabled } from "@uni-scrims/core/config/dev";
import Link from "next/link";
import { safeCallbackURL } from "@/lib/callback-url";
import { getSignedInUser } from "@/lib/session";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  if (await getSignedInUser()) redirect(callbackURL);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold">Anmelden</h1>
      <p>
        Du meldest dich mit deinem Discord-Account an. Dabei wirst du automatisch dem offiziellen
        Uni-Scrims-Discord-Server hinzugefügt. Das ist nötig, damit unser Bot dir Nachrichten
        schicken kann, zum Beispiel das Ergebnis deiner Verifizierung oder Infos zu deinen Scrims.
      </p>
      {params.error ? (
        <p className="text-destructive">
          Die Anmeldung hat nicht geklappt. Bitte versuch es erneut.
        </p>
      ) : null}
      <LoginForm callbackURL={callbackURL} />
      {isDevLoginEnabled() ? (
        <Link href="/dev-login" className="text-sm underline">
          Dev-Login als Seed-Nutzer
        </Link>
      ) : null}
    </main>
  );
}
