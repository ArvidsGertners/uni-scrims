"use client";

import { useActionState, useMemo } from "react";
import { useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { decisionFormMessages } from "@/i18n/admin-client";
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
  const t = useMessages(decisionFormMessages);
  const universityOptions = useMemo(
    () => universities?.map((uni) => ({ value: uni.id, label: `${uni.name} (${uni.city})` })),
    [universities],
  );
  const noAssignment = useMemo(() => ({ value: "", label: t.noAssignment }), [t.noAssignment]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      {universities ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`university-${requestId}`}>{t.assignUniversity}</Label>
          <Combobox
            id={`university-${requestId}`}
            name="universityId"
            defaultValue=""
            placeholder={t.searchUniversity}
            emptyText={t.noUniversityFound}
            options={universityOptions ?? []}
            pinned={noAssignment}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`reason-${requestId}`}>{t.reason}</Label>
        <Textarea id={`reason-${requestId}`} name="rejectReason" maxLength={500} rows={2} />
      </div>
      {state.error ? <p className="text-[14px] text-destructive-text">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="APPROVED" disabled={pending}>
          {t.approve}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="REJECTED"
          variant="destructive"
          disabled={pending}
        >
          {t.reject}
        </Button>
      </div>
    </form>
  );
}
