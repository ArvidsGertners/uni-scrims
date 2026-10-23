import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ConsentCheckbox,
  EmailField,
  PasswordField,
  RealNameFields,
} from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { safeCallbackURL } from "@/lib/callback-url";
import { getSignedInUser } from "@/lib/session";
import { registerAction } from "./actions";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const callbackURL = safeCallbackURL((await searchParams).callbackURL);
  if (await getSignedInUser()) redirect(callbackURL);

  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">Konto erstellen</h1>
        <p className="text-pretty text-muted-foreground">
          Gib deinen Namen so an, wie er auf deiner Immatrikulationsbescheinigung steht. Unsere
          Prüfer vergleichen ihn damit; Teams und Gegner sehen nur deinen Discord-Namen.
        </p>
      </div>
      <section className="flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5">
        <ActionForm
          action={registerAction}
          submitLabel="Konto erstellen"
          size="lg"
          submitClassName="w-full"
          className="flex flex-col gap-[18px]"
        >
          <input type="hidden" name="callbackURL" value={callbackURL} />
          <RealNameFields />
          <EmailField />
          <PasswordField autoComplete="new-password" />
          <ConsentCheckbox />
        </ActionForm>
      </section>
      <p className="text-[14px]">
        Schon ein Konto?{" "}
        <Link
          href={`/login?callbackURL=${encodeURIComponent(callbackURL)}`}
          className="font-semibold underline underline-offset-2"
        >
          Anmelden
        </Link>
      </p>
    </PageMain>
  );
}
