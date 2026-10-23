import { getAccount } from "@uni-scrims/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailField, PasswordField, RealNameFields } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { DiscordButton } from "@/components/discord-button";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { safeCallbackURL } from "@/lib/callback-url";
import { requirePageAccountUser, setupUrl } from "@/lib/session";
import { completeAccountAction, resendVerificationAction } from "./actions";

const cardClass = "flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5";

/** Errors the Discord link sends back as ?error= (ARCHITECTURE §5.8). */
function linkError(code: string): string {
  return code.includes("already_linked")
    ? "Dieses Discord-Konto gehört schon zu einem anderen Uni-Scrims-Konto."
    : "Das Verknüpfen hat nicht geklappt. Bitte versuch es erneut.";
}

/** What an account still lacks, one step at a time (SPEC N-3, ARCHITECTURE §5.8). */
export default async function AccountSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackURL = safeCallbackURL(params.callbackURL);
  const user = await requirePageAccountUser(setupUrl(callbackURL));
  if (user.bannedAt) redirect("/account");
  const account = await getAccount(user.id);
  if (!account.setupStep) redirect(callbackURL);

  return (
    <PageMain className="gap-7">
      {account.setupStep === "COMPLETE_ACCOUNT" ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="type-h1">Konto vervollständigen</h1>
            <p className="text-pretty text-muted-foreground">
              Ab jetzt meldest du dich mit E-Mail und Passwort an; Discord bleibt verknüpft. Deinen
              Namen vergleichen unsere Prüfer mit deiner Immatrikulationsbescheinigung, deshalb so
              wie dort. Teams und Gegner sehen weiter nur deinen Discord-Namen.
            </p>
          </div>
          <Alert>
            <span>
              Deine bisherige Verifizierung gilt danach nicht mehr: Lade deine Bescheinigung bitte
              neu hoch, damit wir sie mit deinem Namen abgleichen können.
            </span>
          </Alert>
          <section className={cardClass}>
            <ActionForm
              action={completeAccountAction}
              submitLabel="Speichern und Link schicken"
              size="lg"
              submitClassName="w-full"
              className="flex flex-col gap-[18px]"
            >
              <input type="hidden" name="callbackURL" value={callbackURL} />
              <RealNameFields />
              <EmailField />
              <PasswordField autoComplete="new-password" />
            </ActionForm>
          </section>
        </>
      ) : account.setupStep === "VERIFY_EMAIL" ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="type-h1">Bestätige deine E-Mail-Adresse</h1>
            <p className="text-pretty text-muted-foreground">
              Wir haben dir einen Link an {account.email} geschickt. Er ist 24 Stunden gültig. Keine
              Mail bekommen? Schau im Spam-Ordner nach.
            </p>
          </div>
          <ActionForm
            action={resendVerificationAction}
            submitLabel="Link noch einmal schicken"
            variant="outline"
            size="sm"
          >
            <input type="hidden" name="callbackURL" value={callbackURL} />
          </ActionForm>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="type-h1">Discord verknüpfen</h1>
            <p className="text-pretty text-muted-foreground">
              Über Discord bekommst du Bewerbungen, Zusagen und Reminder, und gegnerische Captains
              finden dich dort. Dabei wirst du automatisch dem Uni-Scrims-Discord-Server
              hinzugefügt; nur so kann unser Bot dir Nachrichten schicken.
            </p>
          </div>
          {typeof params.error === "string" ? (
            <Alert>
              <span>{linkError(params.error)}</span>
            </Alert>
          ) : null}
          <DiscordButton
            mode="link"
            callbackURL={callbackURL}
            errorCallbackURL={setupUrl(callbackURL)}
          >
            Discord verknüpfen
          </DiscordButton>
        </>
      )}
      <p className="text-[14px] text-muted-foreground">
        Abmelden oder Konto löschen geht unter{" "}
        <Link href="/account" className="text-foreground underline underline-offset-2">
          Konto
        </Link>
        .
      </p>
    </PageMain>
  );
}
