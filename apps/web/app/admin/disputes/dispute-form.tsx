"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { resolveDisputeAction } from "../actions";

type Team = { id: string; name: string };

/** One button per decision of SPEC Flow C 5; the decision is final, so it asks first. */
export function DisputeForm({
  scrimId,
  host,
  guest,
}: {
  scrimId: string;
  host: Team;
  guest: Team;
}) {
  const [state, action, pending] = useActionState(resolveDisputeAction, initialActionState);
  const decisions = [
    { value: "PLAYED", label: "Gespielt" },
    { value: `NO_SHOW:${host.id}`, label: `No-Show von ${host.name}` },
    { value: `NO_SHOW:${guest.id}`, label: `No-Show von ${guest.name}` },
    { value: "UNCLEAR", label: "Unklar" },
  ];

  return (
    <form
      action={action}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        const label = (event.nativeEvent as SubmitEvent).submitter?.textContent;
        if (!window.confirm(`Entscheidung „${label}“ speichern? Sie ist endgültig.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="scrimId" value={scrimId} />
      <div className="flex flex-wrap gap-2">
        {decisions.map((decision) => (
          <Button
            key={decision.value}
            type="submit"
            name="decision"
            value={decision.value}
            variant="outline"
            disabled={pending}
            // Long team names wrap instead of pushing the page wider on phones.
            className="max-w-full py-2 text-left whitespace-normal"
          >
            {decision.label}
          </Button>
        ))}
      </div>
      {state.error ? <p className="text-[14px] text-destructive-text">{state.error}</p> : null}
    </form>
  );
}
