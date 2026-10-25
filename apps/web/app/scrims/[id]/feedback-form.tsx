"use client";

import type { FeedbackOutcome } from "@uni-scrims/db";
import { type ReactNode, useActionState, useState } from "react";
import { useMessages } from "@/components/locale-provider";
import { ToggleOption } from "@/components/toggle-option";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { feedbackFormMessages } from "@/i18n/scrims-client";
import { submitKeepingValues } from "@/lib/submit-form";
import { submitFeedbackAction } from "../actions";

type Props = {
  scrimId: string;
  /** The team the page was shown for (§5.20). */
  teamId: string;
  /** Passed from the server page, so this client component needs no core import. */
  outcomes: { value: FeedbackOutcome; label: string }[];
  ratings: number[];
};

function Question({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 flex items-baseline gap-2.5 text-[16px] font-semibold">
        <span className="font-label text-[12px] text-accent-text">{number}</span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * Outcome toggles; the rating only appears for "Hat stattgefunden" (SPEC P0-8). Sending stays
 * disabled until everything needed is answered.
 */
export function FeedbackForm({ scrimId, teamId, outcomes, ratings }: Props) {
  const t = useMessages(feedbackFormMessages);
  const [state, action, pending] = useActionState(submitFeedbackAction, initialActionState);
  const [outcome, setOutcome] = useState<FeedbackOutcome | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const ready = outcome !== null && (outcome !== "PLAYED" || rating !== null);

  return (
    <form
      action={action}
      className="flex flex-col gap-7"
      onSubmit={(event) => {
        if (!window.confirm(t.confirm)) {
          event.preventDefault();
          return;
        }
        submitKeepingValues(event, action);
      }}
    >
      <input type="hidden" name="scrimId" value={scrimId} />
      <input type="hidden" name="teamId" value={teamId} />
      <Question number="01" title={t.tookPlace}>
        <div className="grid gap-2 sm:grid-cols-3">
          {outcomes.map(({ value, label }) => (
            <ToggleOption
              key={value}
              type="radio"
              name="outcome"
              value={value}
              label={label}
              required
              onChange={() => {
                setOutcome(value);
                // The rating radios unmount for other outcomes and come back unchecked.
                setRating(null);
              }}
            />
          ))}
        </div>
      </Question>
      {outcome === "PLAYED" ? (
        <Question number="02" title={t.rating}>
          <div className="grid grid-cols-5 gap-2">
            {ratings.map((value) => (
              <ToggleOption
                key={value}
                type="radio"
                name="rating"
                value={value}
                label={`${value} ★`}
                required
                onChange={() => setRating(value)}
              />
            ))}
          </div>
        </Question>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" className="w-full" disabled={!ready || pending}>
          {t.submit}
        </Button>
        {state.error ? (
          <p role="alert" className="text-[14px] text-destructive-text">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
