import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginNote } from "@/components/login-note";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { STAFF_SESSION_ERRORS } from "@/lib/auth-paths";
import { safeCallbackURL } from "@/lib/callback-url";
import { getSignedInUser } from "@/lib/session";

/** Errors the Discord login and the auth config send back as ?error= (ARCHITECTURE §5.8, §5.9). */
function loginError(code: string): string {
  if (code === "signup_disabled") {
    return "Zu diesem Discord-Konto gibt es noch kein Uni-Scrims-Konto. Registriere dich mit deiner E-Mail-Adresse und verknüpfe Discord danach.";
  }
  if (code === STAFF_SESSION_ERRORS.discord) {
    return "Admins und Prüfer melden sich mit E-Mail-Adresse, Passwort und Code an, nicht mit Discord.";
  }
  if (code === STAFF_SESSION_ERRORS.link) {
    return "Als Admin oder Prüfer öffnest du Links aus unseren Mails, während du angemeldet bist. Melde dich an und öffne den Link danach noch einmal.";
  }
  return "Die Anmeldung hat nicht geklappt. Bitte versuch es erneut.";
}

/** Its own page like the registration, not the landing hero (ARCHITECTURE §7). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  if (await getSignedInUser()) redirect(callbackURL);

  return (
    <PageMain className="gap-7">
      <h1 className="type-h1">Anmelden</h1>
      {typeof params.error === "string" ? (
        <Alert>
          <span>{loginError(params.error)}</span>
        </Alert>
      ) : null}
      <section className="rounded-lg border border-border bg-card p-5">
        <LoginForm callbackURL={callbackURL} />
      </section>
      <div className="flex flex-col items-start gap-3.5">
        <p className="text-[14px]">
          Noch kein Konto?{" "}
          <Link
            href={`/register?callbackURL=${encodeURIComponent(callbackURL)}`}
            className="font-semibold underline underline-offset-2"
          >
            Registrieren
          </Link>
        </p>
        <LoginNote />
      </div>
    </PageMain>
  );
}
