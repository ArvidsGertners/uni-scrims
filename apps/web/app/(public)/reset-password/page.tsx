import Link from "next/link";
import { PasswordField } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { resetPasswordAction } from "./actions";

/** The target of the password mail: Better Auth checks the token and comes here (§5.8). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && error === undefined;
  return (
    <PageMain className="gap-7">
      <h1 className="type-h1">Neues Passwort</h1>
      {valid ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <ActionForm
            action={resetPasswordAction}
            submitLabel="Passwort speichern"
            size="lg"
            submitClassName="w-full"
            className="flex flex-col gap-[18px]"
          >
            <input type="hidden" name="token" value={token} />
            <PasswordField label="Neues Passwort" autoComplete="new-password" />
          </ActionForm>
        </section>
      ) : (
        <Alert>
          <span>
            Der Link ist ungültig oder abgelaufen.{" "}
            <Link href="/forgot-password" className="font-semibold underline underline-offset-2">
              Neuen Link anfordern
            </Link>
          </span>
        </Alert>
      )}
    </PageMain>
  );
}
