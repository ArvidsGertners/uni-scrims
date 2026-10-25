"use client";

import { useActionState } from "react";
import { useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { teamLimitFormMessages } from "@/i18n/admin-client";
import { initialActionState } from "@/lib/action-state";
import { decideTeamLimitAction } from "../actions";

/** A new limit and Annehmen, or Ablehnen (SPEC N-17); the decision is final, so it asks first. */
export function TeamLimitForm({
  requestId,
  suggestedLimit,
  minLimit,
  maxLimit,
}: {
  requestId: string;
  suggestedLimit: number;
  minLimit: number;
  maxLimit: number;
}) {
  const [state, action, pending] = useActionState(decideTeamLimitAction, initialActionState);
  const t = useMessages(teamLimitFormMessages);
  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        const label = (event.nativeEvent as SubmitEvent).submitter?.textContent;
        if (!window.confirm(t.confirm(label))) event.preventDefault();
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <Field label={t.newLimit}>
        <Input
          name="newLimit"
          type="number"
          inputMode="numeric"
          min={minLimit}
          max={maxLimit}
          defaultValue={suggestedLimit}
          className="max-w-32"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="APPROVED" disabled={pending}>
          {t.accept}
        </Button>
        {/* No limit is needed to reject. */}
        <Button
          type="submit"
          name="decision"
          value="REJECTED"
          variant="outline"
          disabled={pending}
          formNoValidate
        >
          {t.reject}
        </Button>
      </div>
      {state.error ? <p className="text-[14px] text-destructive-text">{state.error}</p> : null}
    </form>
  );
}
