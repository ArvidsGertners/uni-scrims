"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

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
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          Ich bin mindestens 16 Jahre alt und habe die{" "}
          <Link href="/datenschutz" className="underline" target="_blank">
            Datenschutzerklärung
          </Link>{" "}
          gelesen.
        </span>
      </label>
      <Button className="self-start" disabled={!confirmed || pending} onClick={signIn}>
        Mit Discord anmelden
      </Button>
    </div>
  );
}
