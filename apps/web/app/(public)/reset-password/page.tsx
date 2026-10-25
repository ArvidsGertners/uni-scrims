import Link from "next/link";
import { PasswordField } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { passwordMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";
import { resetPasswordAction } from "./actions";

/** The target of the password mail: Better Auth checks the token and comes here (§5.8). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && error === undefined;
  const t = await getMessages(passwordMessages);
  return (
    <PageMain className="gap-7">
      <h1 className="type-h1">{t.resetTitle}</h1>
      {valid ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <ActionForm
            action={resetPasswordAction}
            submitLabel={t.save}
            size="lg"
            submitClassName="w-full"
            className="flex flex-col gap-[18px]"
          >
            <input type="hidden" name="token" value={token} />
            <PasswordField label={t.newPassword} autoComplete="new-password" />
          </ActionForm>
        </section>
      ) : (
        <Alert>
          <span>
            {t.invalidLink((label) => (
              <Link href="/forgot-password" className="font-semibold underline underline-offset-2">
                {label}
              </Link>
            ))}
          </span>
        </Alert>
      )}
    </PageMain>
  );
}
