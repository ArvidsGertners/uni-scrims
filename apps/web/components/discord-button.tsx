"use client";

import { useState } from "react";
import { LogInIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Discord over OAuth (ARCHITECTURE §5.8): "signIn" only for accounts that linked Discord already,
 * "link" connects it to the signed-in account. Errors come back as ?error=… on errorCallbackURL.
 */
export function DiscordButton({
  mode,
  callbackURL,
  errorCallbackURL,
  children,
  variant,
}: {
  mode: "signIn" | "link";
  callbackURL: string;
  errorCallbackURL: string;
  children: React.ReactNode;
  variant?: "default" | "outline";
}) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const options = { provider: "discord" as const, callbackURL, errorCallbackURL };
    const { error } =
      mode === "link"
        ? await authClient.linkSocial(options)
        : await authClient.signIn.social(options);
    if (error) setPending(false);
  }

  return (
    <Button
      size="xl"
      variant={variant}
      className="max-sm:w-full"
      disabled={pending}
      onClick={start}
    >
      <LogInIcon size={20} strokeWidth={2.2} />
      {children}
    </Button>
  );
}
