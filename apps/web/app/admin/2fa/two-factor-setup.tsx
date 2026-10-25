"use client";

import { useActionState } from "react";
import { PasswordField } from "@/components/account-fields";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { type TwoFactorSetupState, confirmTwoFactorAction, startTwoFactorAction } from "./actions";

const cardClass = "flex flex-col gap-[18px] rounded-lg border border-border bg-card p-5";

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[14px] text-destructive-text">
      {error}
    </p>
  ) : null;
}

/** Password, then QR code with backup codes, then the first code (SPEC N-4). */
export function TwoFactorSetup() {
  const [started, start, starting] = useActionState<TwoFactorSetupState, FormData>(
    startTwoFactorAction,
    initialActionState,
  );
  const [confirmed, confirm, confirming] = useActionState<TwoFactorSetupState, FormData>(
    confirmTwoFactorAction,
    initialActionState,
  );
  const setup = started.setup;

  if (!setup) {
    return (
      <form action={start} className={cardClass}>
        <PasswordField label="Dein Passwort" autoComplete="current-password" />
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" disabled={starting} className="w-full">
            Weiter
          </Button>
          <ErrorLine error={started.error} />
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className={cardClass}>
        <h2 className="type-h2">1. QR-Code scannen</h2>
        <p className="text-[14px] text-pretty text-muted-foreground">
          Scanne den Code mit einer Authenticator-App (z. B. Aegis, 2FAS, Google Authenticator oder
          die Passwörter-App deines Geräts). Ohne Kamera gibst du den Schlüssel von Hand ein.
        </p>
        <div
          className="w-56 self-center rounded-sm bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
          // The SVG comes from uqr on the server, built from the otpauth URI.
          dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
        />
        <p className="font-label text-[14px] break-all select-all">{setup.secret}</p>
      </section>
      <section className={cardClass}>
        <h2 className="type-h2">2. Backup-Codes aufbewahren</h2>
        <p className="text-[14px] text-pretty text-muted-foreground">
          Jeder Code funktioniert einmal, falls du dein Gerät verlierst. Speichere sie in deinem
          Passwort-Manager; wir zeigen sie nur jetzt.
        </p>
        <ul className="grid grid-cols-2 gap-2 font-label text-[14px] select-all">
          {setup.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </section>
      <form action={confirm} className={cardClass}>
        <h2 className="type-h2">3. Code eingeben</h2>
        <Field label="Code aus der App">
          <Input
            name="code"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            className="font-label tracking-[0.2em]"
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" disabled={confirming} className="w-full">
            Einrichten
          </Button>
          <ErrorLine error={confirmed.error} />
        </div>
      </form>
    </div>
  );
}
