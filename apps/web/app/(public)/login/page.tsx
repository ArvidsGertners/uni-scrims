import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginNote } from "@/components/login-note";
import { LoginHero } from "@/components/login-hero";
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  if (await getSignedInUser()) redirect(callbackURL);

  return (
    <LoginHero
      notice={
        typeof params.error === "string" ? (
          <Alert>
            <span>{loginError(params.error)}</span>
          </Alert>
        ) : null
      }
      footer={<LoginNote />}
    >
      <LoginForm callbackURL={callbackURL} />
    </LoginHero>
  );
}
