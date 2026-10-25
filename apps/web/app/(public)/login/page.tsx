import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoginNote } from "@/components/login-note";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { loginMessages } from "@/i18n/public";
import { STAFF_SESSION_ERRORS } from "@/lib/auth-paths";
import { safeCallbackURL } from "@/lib/callback-url";
import { getMessages } from "@/lib/locale";
import { getSignedInUser } from "@/lib/session";

/** Errors the Discord login and the auth config send back as ?error= (ARCHITECTURE §5.8, §5.9). */
function loginError(code: string, errors: (typeof loginMessages)["de"]["errors"]): string {
  if (code === "signup_disabled") return errors.signupDisabled;
  if (code === STAFF_SESSION_ERRORS.discord) return errors.staffDiscord;
  if (code === STAFF_SESSION_ERRORS.link) return errors.staffLink;
  return errors.other;
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
  const t = await getMessages(loginMessages);

  return (
    <PageMain className="gap-7">
      <h1 className="type-h1">{t.title}</h1>
      {typeof params.error === "string" ? (
        <Alert>
          <span>{loginError(params.error, t.errors)}</span>
        </Alert>
      ) : null}
      <section className="rounded-lg border border-border bg-card p-5">
        <LoginForm callbackURL={callbackURL} />
      </section>
      <div className="flex flex-col items-start gap-3.5">
        <p className="text-[14px]">
          {t.noAccount((label) => (
            <Link
              href={`/register?callbackURL=${encodeURIComponent(callbackURL)}`}
              className="font-semibold underline underline-offset-2"
            >
              {label}
            </Link>
          ))}
        </p>
        <LoginNote />
      </div>
    </PageMain>
  );
}
