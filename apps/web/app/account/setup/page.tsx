import { getAccount } from "@uni-scrims/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EmailField, PasswordField, RealNameFields } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { DiscordButton } from "@/components/discord-button";
import { PageMain } from "@/components/page-main";
import { Alert } from "@/components/ui/alert";
import { safeCallbackURL } from "@/lib/callback-url";
import { setupPageMessages } from "@/i18n/account";
import { getMessages } from "@/lib/locale";
import { requirePageAccountUser, setupUrl } from "@/lib/session";
import { completeAccountAction, resendVerificationAction } from "./actions";

const cardClass = "flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5";

/** Errors the Discord link sends back as ?error= (ARCHITECTURE §5.8). */
function linkError(code: string, t: { discordAlreadyLinked: string; discordLinkFailed: string }) {
  return code.includes("already_linked") ? t.discordAlreadyLinked : t.discordLinkFailed;
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
  const t = await getMessages(setupPageMessages);

  return (
    <PageMain className="gap-7">
      {account.setupStep === "COMPLETE_ACCOUNT" ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="type-h1">{t.completeTitle}</h1>
            <p className="text-pretty text-muted-foreground">{t.completeText}</p>
          </div>
          <Alert>
            <span>{t.completeNotice}</span>
          </Alert>
          <section className={cardClass}>
            <ActionForm
              action={completeAccountAction}
              submitLabel={t.completeSubmit}
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
            <h1 className="type-h1">{t.verifyEmailTitle}</h1>
            <p className="text-pretty text-muted-foreground">
              {t.verifyEmailText(account.email ?? "")}
            </p>
          </div>
          {typeof params.error === "string" ? (
            <Alert>
              <span>{t.verifyEmailLinkInvalid}</span>
            </Alert>
          ) : null}
          <ActionForm
            action={resendVerificationAction}
            submitLabel={t.resendLink}
            variant="outline"
            size="sm"
          >
            <input type="hidden" name="callbackURL" value={callbackURL} />
          </ActionForm>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <h1 className="type-h1">{t.discordTitle}</h1>
            <p className="text-pretty text-muted-foreground">{t.discordText}</p>
          </div>
          {typeof params.error === "string" ? (
            <Alert>
              <span>{linkError(params.error, t)}</span>
            </Alert>
          ) : null}
          <DiscordButton
            mode="link"
            callbackURL={callbackURL}
            errorCallbackURL={setupUrl(callbackURL)}
          >
            {t.linkDiscord}
          </DiscordButton>
        </>
      )}
      <p className="text-[14px] text-muted-foreground">
        {t.signOutOrDelete((label) => (
          <Link href="/account" className="text-foreground underline underline-offset-2">
            {label}
          </Link>
        ))}
      </p>
    </PageMain>
  );
}
