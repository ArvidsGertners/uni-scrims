"use client";

import { TEAM_NAME_MAX, TEAM_TAG_MAX } from "@uni-scrims/core/config/limits";
import { useRef, useState, useTransition } from "react";
import { useMessages } from "@/components/locale-provider";
import { OplUrlInput } from "@/components/opl-url-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { oplTeamFieldMessages } from "@/i18n/team-client";
import { previewOplTeamAction } from "./actions";

/** Sets a field of the form as if typed, so the unsaved-changes prompt sees it (§5.33). */
function fill(form: HTMLFormElement | null | undefined, name: string, value: string) {
  const input = form?.elements.namedItem(name);
  if (!(input instanceof HTMLInputElement)) return;
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * The optional OPL team when founding (SPEC N-35): "Von OPL übernehmen" fills in name and tag from
 * OPL; both stay editable. The link itself is checked when the form is sent.
 */
export function OplTeamField() {
  const t = useMessages(oplTeamFieldMessages);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function prefill() {
    const url = input.current?.value.trim() ?? "";
    if (!url) {
      setError(t.linkFirst);
      return;
    }
    startTransition(async () => {
      const result = await previewOplTeamAction(url);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(null);
      const form = input.current?.form;
      fill(form, "name", Array.from(result.name).slice(0, TEAM_NAME_MAX).join(""));
      if (result.shortName) {
        fill(form, "tag", Array.from(result.shortName).slice(0, TEAM_TAG_MAX).join(""));
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Field label={t.label} hint={t.optional}>
        <OplUrlInput ref={input} name="oplUrl" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={prefill} disabled={pending}>
          {t.prefill}
        </Button>
        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <p className="text-[13px] text-pretty text-muted-foreground">{t.hint}</p>
    </div>
  );
}
