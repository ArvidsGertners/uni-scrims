// Also used by the client login form, so only the import-free config of core.
import { PASSWORD_MIN, REAL_NAME_MAX } from "@uni-scrims/core/config/account";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** First and last name as on the certificate (SPEC N-3); server component, no client code. */
export function RealNameFields({
  defaults,
}: {
  defaults?: { firstName: string; lastName: string };
}) {
  return (
    <div className="grid gap-[18px] sm:grid-cols-2">
      <Field label="Vorname">
        <Input
          name="firstName"
          required
          maxLength={REAL_NAME_MAX}
          autoComplete="given-name"
          defaultValue={defaults?.firstName}
        />
      </Field>
      <Field label="Nachname">
        <Input
          name="lastName"
          required
          maxLength={REAL_NAME_MAX}
          autoComplete="family-name"
          defaultValue={defaults?.lastName}
        />
      </Field>
    </div>
  );
}

export function EmailField({
  label = "E-Mail-Adresse",
  name = "email",
}: {
  label?: string;
  name?: string;
}) {
  return (
    <Field label={label}>
      <Input name={name} type="email" required autoComplete="email" />
    </Field>
  );
}

/** `autoComplete` tells password managers whether to fill in or to suggest a new password. */
export function PasswordField({
  label = "Passwort",
  name = "password",
  autoComplete,
  hint,
}: {
  label?: string;
  name?: string;
  autoComplete: "new-password" | "current-password";
  hint?: React.ReactNode;
}) {
  const isNew = autoComplete === "new-password";
  return (
    <Field label={label} hint={hint ?? (isNew ? `mindestens ${PASSWORD_MIN} Zeichen` : undefined)}>
      <Input
        name={name}
        type="password"
        required
        minLength={isNew ? PASSWORD_MIN : undefined}
        autoComplete={autoComplete}
      />
    </Field>
  );
}

/** The age and privacy confirmation of SPEC P0-1, since Phase 7 at the registration (N-3). */
export function ConsentCheckbox() {
  return (
    <label className="flex items-start gap-2.5 text-[14px]">
      <input
        type="checkbox"
        name="consent"
        required
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        Ich bin mindestens 16 Jahre alt und habe die{" "}
        <Link href="/datenschutz" className="underline underline-offset-2" target="_blank">
          Datenschutzerklärung
        </Link>{" "}
        gelesen.
      </span>
    </label>
  );
}
