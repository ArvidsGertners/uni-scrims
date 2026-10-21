"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { decideVerificationAction } from "./actions";

type University = { id: string; name: string; city: string };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`university-${requestId}`}>Hochschule zuordnen (optional)</Label>
          <select
            id={`university-${requestId}`}
            name="universityId"
            defaultValue=""
            className={selectClass}
          >
            <option value="">Keine Zuordnung</option>
            {universities.map((uni) => (
              <option key={uni.id} value={uni.id}>
                {uni.name} ({uni.city})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reason-${requestId}`}>Grund (nur beim Ablehnen)</Label>
        <Textarea id={`reason-${requestId}`} name="rejectReason" maxLength={500} rows={2} />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
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
