import Link from "next/link";
import { LandingHero } from "@/components/landing-hero";
import { LoginNote } from "@/components/login-note";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { landingMessages } from "@/i18n/public";
import { DEFAULT_AFTER_LOGIN } from "@/lib/callback-url";
import { getMessages } from "@/lib/locale";
import { getSignedInUser } from "@/lib/session";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gesperrt, geloescht } = await searchParams;
  const loggedIn = (await getSignedInUser()) !== null;
  const t = await getMessages(landingMessages);
  const linkClass = "font-semibold underline underline-offset-2";

  return (
    <LandingHero
      notice={
        gesperrt ? (
          <Alert>
            <span>
              {t.bannedNotice((label) => (
                <Link href="/account" className={linkClass}>
                  {label}
                </Link>
              ))}
            </span>
          </Alert>
        ) : geloescht ? (
          <Alert variant="success">
            <span>{t.deletedNotice}</span>
          </Alert>
        ) : null
      }
      footer={gesperrt || loggedIn ? null : <LoginNote />}
    >
      {gesperrt ? null : loggedIn ? (
        <Link href="/scrims" className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}>
          {t.toBoard}
        </Link>
      ) : (
        <div className="flex w-full flex-wrap gap-3">
          <Link
            href="/register"
            className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}
          >
            {t.createAccount}
          </Link>
          <Link
            href={`/login?callbackURL=${encodeURIComponent(DEFAULT_AFTER_LOGIN)}`}
            className={buttonVariants({
              size: "xl",
              variant: "outline",
              className: "max-sm:w-full",
            })}
          >
            {t.signIn}
          </Link>
        </div>
      )}
    </LandingHero>
  );
}
