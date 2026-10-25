import { EmailField } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { passwordMessages } from "@/i18n/public";
import { getMessages } from "@/lib/locale";
import { forgotPasswordAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sent = (await searchParams).gesendet !== undefined;
  const t = await getMessages(passwordMessages);
  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.forgotTitle}</h1>
        <p className="text-pretty text-muted-foreground">{t.forgotLead}</p>
      </div>
      {sent ? (
        <Alert variant="success">
          <span>{t.sent}</span>
        </Alert>
      ) : (
        <section className="rounded-lg border border-border bg-card p-5">
          <ActionForm
            action={forgotPasswordAction}
            submitLabel={t.send}
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
