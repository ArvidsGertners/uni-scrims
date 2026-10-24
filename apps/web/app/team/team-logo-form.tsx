"use client";

import { MAX_LOGO_BYTES } from "@uni-scrims/core/config/uploads";
import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { submitKeepingValues } from "@/lib/submit-form";
import { setTeamLogoAction } from "./actions";

/**
 * Logo upload of the captain (SPEC N-6). The page keys it by the logo version, so it starts over
 * once a new logo is saved.
 */
export function TeamLogoForm({ teamId, hasLogo }: { teamId: string; hasLogo: boolean }) {
  const [state, action, pending] = useActionState(setTeamLogoAction, initialActionState);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const error = fileError ?? state.error;

  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        // Files over the server action body limit would fail without a message.
        const picked = new FormData(event.currentTarget).get("logo");
        if (!(picked instanceof File) || picked.size === 0) {
          event.preventDefault();
          setFileError("Bitte wähle ein Bild aus.");
          return;
        }
        if (picked.size > MAX_LOGO_BYTES) {
          event.preventDefault();
          setFileError("Die Datei ist größer als 2 MB.");
          return;
        }
        setFileError(null);
        submitKeepingValues(event, action);
      }}
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input
        ref={inputRef}
        type="file"
        name="logo"
        accept=".png,.webp,image/png,image/webp"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(event) => {
          setFileName(event.currentTarget.files?.[0]?.name ?? null);
          setFileError(null);
        }}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {hasLogo ? "Anderes Bild wählen" : "Bild wählen"}
        </Button>
        <span className="min-w-0 truncate text-[14px] text-muted-foreground">
          {fileName ?? "Keine Datei gewählt"}
        </span>
      </div>
      {fileName ? (
        <Button type="submit" size="sm" disabled={pending} className="self-start">
          Logo hochladen
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-[14px] text-accent-text">
          {error}
        </p>
      ) : null}
    </form>
  );
}
