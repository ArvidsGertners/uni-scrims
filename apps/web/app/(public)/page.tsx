import Link from "next/link";
import { LoginNote } from "@/components/login-note";
import { LoginHero } from "@/components/login-hero";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_AFTER_LOGIN } from "@/lib/callback-url";
import { getSignedInUser } from "@/lib/session";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { gesperrt, geloescht } = await searchParams;
  const loggedIn = (await getSignedInUser()) !== null;
  const linkClass = "font-semibold underline underline-offset-2";

  return (
    <LoginHero
      notice={
        gesperrt ? (
          <Alert>
            <span>
              Dein Konto ist gesperrt. Du kannst es unter{" "}
              <Link href="/account" className={linkClass}>
                Konto
              </Link>{" "}
              löschen.
            </span>
          </Alert>
        ) : geloescht ? (
          <Alert variant="success">
            <span>Dein Konto wurde gelöscht.</span>
          </Alert>
        ) : null
      }
      footer={gesperrt || loggedIn ? null : <LoginNote />}
    >
      {gesperrt ? null : loggedIn ? (
        <Link href="/scrims" className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}>
          Zum Board
        </Link>
      ) : (
        <div className="flex w-full flex-wrap gap-3">
          <Link
            href="/register"
            className={buttonVariants({ size: "xl", className: "max-sm:w-full" })}
          >
            Konto erstellen
          </Link>
          <Link
            href={`/login?callbackURL=${encodeURIComponent(DEFAULT_AFTER_LOGIN)}`}
            className={buttonVariants({
              size: "xl",
              variant: "outline",
              className: "max-sm:w-full",
            })}
          >
            Anmelden
          </Link>
        </div>
      )}
    </LoginHero>
  );
}
