"use client";

import Link from "next/link";
import { loginAction } from "@/app/(public)/login/actions";
import { EmailField, PasswordField } from "@/components/account-fields";
import { ActionForm } from "@/components/action-form";
import { DiscordButton } from "@/components/discord-button";

/** Email and password, or Discord for accounts that linked it (SPEC N-3). */
export function LoginForm({ callbackURL }: { callbackURL: string }) {
  const encoded = encodeURIComponent(callbackURL);
  return (
    <div className="flex flex-col gap-5">
      <ActionForm
        action={loginAction}
        submitLabel="Anmelden"
        size="lg"
        submitClassName="w-full"
        className="flex flex-col gap-[18px]"
      >
        <input type="hidden" name="callbackURL" value={callbackURL} />
        <EmailField />
        <PasswordField
          autoComplete="current-password"
          hint={
            <Link href="/forgot-password" className="underline underline-offset-2">
              Vergessen?
            </Link>
          }
        />
      </ActionForm>
      <div className="flex items-center gap-3 text-[13px] text-faint">
        <span className="h-px flex-1 bg-border" />
        oder
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-2">
        <DiscordButton
          mode="signIn"
          variant="outline"
          callbackURL={callbackURL}
          errorCallbackURL={`/login?callbackURL=${encoded}`}
        >
          Mit Discord anmelden
        </DiscordButton>
        <span className="text-[13px] text-muted-foreground">
          Geht, sobald du Discord mit deinem Konto verknüpft hast.
        </span>
      </div>
    </div>
  );
}
