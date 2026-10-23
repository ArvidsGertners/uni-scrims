import { EmailField } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { forgotPasswordAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sent = (await searchParams).gesendet !== undefined;
  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">Passwort vergessen</h1>
        <p className="text-pretty text-muted-foreground">
          Gib die E-Mail-Adresse deines Kontos an. Wir schicken dir einen Link, über den du ein
          neues Passwort setzt.
        </p>
      </div>
      {sent ? (
        <Alert variant="success">
          <span>
            Falls es ein Konto mit dieser Adresse gibt, haben wir dir einen Link geschickt. Er ist 1
            Stunde gültig.
          </span>
        </Alert>
      ) : (
        <section className="rounded-lg border border-border bg-card p-5">
          <ActionForm
            action={forgotPasswordAction}
            submitLabel="Link schicken"
            size="lg"
            submitClassName="w-full"
            className="flex flex-col gap-[18px]"
          >
            <EmailField />
          </ActionForm>
        </section>
      )}
    </PageMain>
  );
}
