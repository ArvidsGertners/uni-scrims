"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { decideVerificationAction } from "./actions";

type University = { id: string; name: string; city: string };

export function DecisionForm({
  requestId,
  universities,
}: {
  requestId: string;
  /** Only for "Andere": optional assignment to a seed university. */
  universities: University[] | null;
}) {
  const [state, action, pending] = useActionState(decideVerificationAction, initialActionState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      {universities ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`university-${requestId}`}>Hochschule zuordnen (optional)</Label>
          <Select
            id={`university-${requestId}`}
            name="universityId"
            defaultValue=""
            options={[
              { value: "", label: "Keine Zuordnung" },
              ...universities.map((uni) => ({ value: uni.id, label: `${uni.name} (${uni.city})` })),
            ]}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`reason-${requestId}`}>Grund (nur beim Ablehnen)</Label>
        <Textarea id={`reason-${requestId}`} name="rejectReason" maxLength={500} rows={2} />
      </div>
      {state.error ? <p className="text-[14px] text-accent-text">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="APPROVED" disabled={pending}>
          Freigeben
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECTED"
          variant="destructive"
          disabled={pending}
        >
          Ablehnen
        </Button>
      </div>
    </form>
  );
}
