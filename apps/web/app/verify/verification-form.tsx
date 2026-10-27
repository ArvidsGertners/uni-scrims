"use client";

import { INTL_LOCALES, type Locale } from "@uni-scrims/core/config/locale";
import { MAX_UPLOAD_BYTES } from "@uni-scrims/core/config/uploads";
import { cn } from "cn";
import { useActionState, useMemo, useRef, useState } from "react";
import { CheckIcon, FileIcon, ShieldCheckIcon, UploadIcon } from "@/components/icons";
import { useLocale, useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { verificationFormMessages } from "@/i18n/account-client";
import { initialActionState } from "@/lib/action-state";
import { submitKeepingValues } from "@/lib/submit-form";
import { submitVerificationAction } from "./actions";
import { OTHER_UNIVERSITY } from "./constants";

type University = { id: string; name: string; city: string };

function formatSize(bytes: number, locale: Locale): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toLocaleString(INTL_LOCALES[locale], { maximumFractionDigits: 1 })} MB`;
}

/** Upload screen of the design handoff: university, drop zone, hints, privacy note (SPEC P0-2). */
export function VerificationForm({
  universities,
  checks,
}: {
  universities: University[];
  /** "Darauf achten wir", with the current semester. */
  checks: string[];
}) {
  const [state, action, pending] = useActionState(submitVerificationAction, initialActionState);
  const locale = useLocale();
  const t = useMessages(verificationFormMessages);
  const [university, setUniversity] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const error = sizeError ?? state.error;
  const universityOptions = useMemo(
    () => universities.map((uni) => ({ value: uni.id, label: `${uni.name} (${uni.city})` })),
    [universities],
  );
  const otherOption = useMemo(
    () => ({ value: OTHER_UNIVERSITY, label: t.otherUniversity }),
    [t.otherUniversity],
  );

  const pick = (files: FileList | null) => {
    const picked = files?.[0];
    setFile(picked ? { name: picked.name, size: picked.size } : null);
    setSizeError(null);
  };

  return (
    <form
      action={action}
      className="flex flex-col gap-7"
      onSubmit={(event) => {
        // Files above the server action body limit never reach core and would fail without a message.
        const picked = new FormData(event.currentTarget).get("file");
        if (picked instanceof File && picked.size > MAX_UPLOAD_BYTES) {
          event.preventDefault();
          setSizeError(t.fileTooLarge);
          return;
        }
        setSizeError(null);
        // Keeps the chosen file when core rejects it, so the file row stays true.
        submitKeepingValues(event, action);
      }}
    >
      <div className="flex flex-col gap-4">
        <Field label={t.university}>
          <Combobox
            name="university"
            required
            value={university}
            onValueChange={setUniversity}
            placeholder={t.searchUniversity}
            emptyText={t.noUniversityFound}
            options={universityOptions}
            pinned={otherOption}
          />
        </Field>
        {university === OTHER_UNIVERSITY ? (
          <Field label={t.otherUniversityName}>
            <Input name="universityOther" required maxLength={200} />
          </Field>
        ) : null}
      </div>

      {/* The input stays mounted (and in the form) while the file row is shown. */}
      <input
        ref={input}
        id="file"
        name="file"
        type="file"
        required
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => pick(event.target.files)}
      />
      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-primary bg-card px-4 py-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent-text">
            <FileIcon size={20} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-semibold">{file.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {formatSize(file.size, locale)}
            </span>
          </div>
          <Button
            variant="ghost"
            size="bare"
            className="min-h-10 px-2.5 text-[14px]"
            onClick={() => {
              if (input.current) input.current.value = "";
              pick(null);
            }}
          >
            {t.remove}
          </Button>
        </div>
      ) : (
        <label
          htmlFor="file"
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (input.current && event.dataTransfer.files.length > 0) {
              input.current.files = event.dataTransfer.files;
              pick(event.dataTransfer.files);
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2.5 rounded-lg border-2 border-dashed border-border-strong px-5 py-9 text-center hover:border-primary hover:bg-accent-soft",
            dragging && "border-primary bg-accent-soft",
          )}
        >
          <span className="flex size-[52px] items-center justify-center rounded-lg bg-accent-soft text-accent-text">
            <UploadIcon size={24} />
          </span>
          <span className="text-[16px] font-semibold">{t.chooseFile}</span>
          <span className="text-[13px] text-faint">{t.fileTypes}</span>
        </label>
      )}

      <div className="flex flex-col gap-2.5">
        <span className="type-label text-muted-foreground">{t.checksTitle}</span>
        {checks.map((check) => (
          <span key={check} className="flex items-center gap-2.5 text-[15px]">
            <CheckIcon strokeWidth={3} className="text-success" />
            {check}
          </span>
        ))}
      </div>

      <div className="flex gap-3 rounded-sm border border-border bg-card p-4">
        <ShieldCheckIcon size={20} className="text-success" />
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-semibold">{t.privacyTitle}</span>
            <span className="text-[14px] text-pretty text-muted-foreground">{t.privacyText}</span>
          </div>
          <label className="flex items-start gap-2.5 text-[14px]">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 size-4 accent-primary"
            />
            {t.consent}
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" className="w-full" disabled={!file || pending}>
          {pending ? t.uploading : t.submit}
        </Button>
        {error ? (
          <p role="alert" className="text-[14px] text-destructive-text">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
