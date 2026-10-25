import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageMain } from "@/components/page-main";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginCodeMessages } from "@/i18n/public";
import { safeCallbackURL } from "@/lib/callback-url";
import { getMessages } from "@/lib/locale";
import { verifyLoginCodeAction } from "./actions";

/** Second step of a staff login (§5.9); Better Auth keeps the pending login in a cookie (10 min). */
export default async function LoginCodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const callbackURL = safeCallbackURL((await searchParams).callbackURL);
  const t = await getMessages(loginCodeMessages);
  return (
    <PageMain className="gap-7">
      <div className="flex flex-col gap-2.5">
        <h1 className="type-h1">{t.title}</h1>
        <p className="text-pretty text-muted-foreground">{t.lead}</p>
      </div>
      <section className="rounded-lg border border-border bg-card p-5">
        <ActionForm
          action={verifyLoginCodeAction}
          submitLabel={t.submit}
          size="lg"
          submitClassName="w-full"
          className="flex flex-col gap-[18px]"
        >
          <input type="hidden" name="callbackURL" value={callbackURL} />
          <Field label={t.code}>
            <Input
              name="code"
              required
              autoComplete="one-time-code"
              inputMode="text"
              autoFocus
              className="font-label tracking-[0.2em]"
            />
          </Field>
          <label className="flex items-center gap-2.5 text-[14px]">
            <input type="checkbox" name="backup" className="size-4 accent-primary" />
            {t.backup}
          </label>
        </ActionForm>
      </section>
      <p className="text-[14px] text-muted-foreground">
        {t.noAccess((label) => (
          <Link href="/login" className="text-foreground underline underline-offset-2">
            {label}
          </Link>
        ))}
      </p>
    </PageMain>
  );
}
