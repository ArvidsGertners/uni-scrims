"use client";

// A client component for its texts (§5.21), as the client login form uses it too; so only the
// import-free config of core.
import { PASSWORD_MIN, REAL_NAME_MAX } from "@uni-scrims/core/config/account";
import Link from "next/link";
import { useMessages } from "@/components/locale-provider";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { accountFieldsMessages } from "@/i18n/client";

/** First and last name as on the certificate (SPEC N-3). */
export function RealNameFields({
  defaults,
}: {
  defaults?: { firstName: string; lastName: string };
}) {
  const t = useMessages(accountFieldsMessages);
  return (
    <div className="grid gap-[18px] sm:grid-cols-2">
      <Field label={t.firstName}>
        <Input
          name="firstName"
          required
          maxLength={REAL_NAME_MAX}
          autoComplete="given-name"
          defaultValue={defaults?.firstName}
        />
      </Field>
      <Field label={t.lastName}>
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

export function EmailField({ label, name = "email" }: { label?: string; name?: string }) {
  const t = useMessages(accountFieldsMessages);
  return (
    <Field label={label ?? t.email}>
      <Input name={name} type="email" required autoComplete="email" />
    </Field>
  );
}

/** `autoComplete` tells password managers whether to fill in or to suggest a new password. */
export function PasswordField({
  label,
  name = "password",
  autoComplete,
  hint,
}: {
  label?: string;
  name?: string;
  autoComplete: "new-password" | "current-password";
  hint?: React.ReactNode;
}) {
  const t = useMessages(accountFieldsMessages);
  const isNew = autoComplete === "new-password";
  return (
    <Field
      label={label ?? t.password}
      hint={hint ?? (isNew ? t.minLength(PASSWORD_MIN) : undefined)}
    >
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
  const t = useMessages(accountFieldsMessages);
  return (
    <label className="flex items-start gap-2.5 text-[14px]">
      <input
        type="checkbox"
        name="consent"
        required
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span>
        {t.consent((label) => (
          <Link
            key="link"
            href="/datenschutz"
            className="underline underline-offset-2"
            target="_blank"
          >
            {label}
          </Link>
        ))}
      </span>
    </label>
  );
}
