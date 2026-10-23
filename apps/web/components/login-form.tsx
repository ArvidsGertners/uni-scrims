"use client";

import Link from "next/link";
import { useState } from "react";
import { LogInIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Age and privacy confirmation (SPEC P0-1), then the Discord login. */
export function LoginForm({ callbackURL }: { callbackURL: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "discord",
      callbackURL,
      errorCallbackURL: "/login?error=1",
    });
    if (error) setPending(false);
  }

  return (
    <div className="flex w-full flex-col items-start gap-3.5">
      <label className="flex items-start gap-2.5 text-[14px]">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          Ich bin mindestens 16 Jahre alt und habe die{" "}
          <Link href="/datenschutz" className="underline underline-offset-2" target="_blank">
            Datenschutzerklärung
          </Link>{" "}
          gelesen.
        </span>
      </label>
      <Button size="xl" className="max-sm:w-full" disabled={!confirmed || pending} onClick={signIn}>
        <LogInIcon size={20} strokeWidth={2.2} />
        Mit Discord anmelden
      </Button>
    </div>
  );
}
