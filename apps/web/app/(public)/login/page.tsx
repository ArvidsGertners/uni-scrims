import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginNote } from "@/components/login-note";
import { LoginHero } from "@/components/login-hero";
import { Alert } from "@/components/ui/alert";
import { safeCallbackURL } from "@/lib/callback-url";
import { getSignedInUser } from "@/lib/session";

/** Errors the Discord login sends back as ?error= (ARCHITECTURE §5.8). */
function discordError(code: string): string {
  return code === "signup_disabled"
    ? "Zu diesem Discord-Konto gibt es noch kein Uni-Scrims-Konto. Registriere dich mit deiner E-Mail-Adresse und verknüpfe Discord danach."
    : "Die Anmeldung hat nicht geklappt. Bitte versuch es erneut.";
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
            <span>{discordError(params.error)}</span>
          </Alert>
        ) : null
      }
      footer={<LoginNote />}
    >
      <LoginForm callbackURL={callbackURL} />
    </LoginHero>
  );
}
