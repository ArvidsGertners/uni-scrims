"use client";

import type { FeedbackOutcome } from "@uni-scrims/db";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { submitFeedbackAction } from "../actions";

type Props = {
  scrimId: string;
  /** Passed from the server page, so this client component needs no core import. */
  outcomes: { value: FeedbackOutcome; label: string }[];
  ratings: number[];
};

/** Outcome radios; the star rating only appears for "Hat stattgefunden". */
export function FeedbackForm({ scrimId, outcomes, ratings }: Props) {
  const [state, action, pending] = useActionState(submitFeedbackAction, initialActionState);
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);

  return (
    <form
      action={action}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        if (!window.confirm("Antwort abschicken? Sie lässt sich danach nicht mehr ändern.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="scrimId" value={scrimId} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Hat der Scrim stattgefunden?</legend>
        {outcomes.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="outcome"
              value={value}
              required
              onChange={() => setOutcome(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {outcome === "PLAYED" ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Bewertung des Gegners</legend>
          <div className="flex flex-wrap gap-3">
            {ratings.map((rating) => (
              <label key={rating} className="flex items-center gap-1 text-sm">
                <input type="radio" name="rating" value={rating} required />
                {"★".repeat(rating)}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-1">
        <Button type="submit" className="self-start" disabled={pending}>
          Feedback abschicken
        </Button>
        {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    </form>
  );
}
