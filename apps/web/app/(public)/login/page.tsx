import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginNote } from "@/components/login-note";
import { LoginHero } from "@/components/login-hero";
import { Alert } from "@/components/ui/alert";
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
    <LoginHero
      notice={
        params.error ? (
          <Alert>
            <span>Die Anmeldung hat nicht geklappt. Bitte versuch es erneut.</span>
          </Alert>
        ) : null
      }
      footer={<LoginNote />}
    >
      <LoginForm callbackURL={callbackURL} />
    </LoginHero>
  );
}
