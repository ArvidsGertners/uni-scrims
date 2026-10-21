"use server";

import { cancelScrim, submitFeedback } from "@uni-scrims/core";
import type { FeedbackOutcome } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

const id = z.string().min(1);
const invalid: ActionState = { error: "Ungültige Eingabe." };

function field(formData: FormData, name: string): FormDataEntryValue | undefined {
  return formData.get(name) ?? undefined;
}

async function finish(scrimId: string, state: ActionState): Promise<ActionState> {
  revalidatePath(`/scrims/${scrimId}`);
  revalidatePath("/scrims");
  return state;
}

export async function cancelScrimAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const scrimId = id.safeParse(field(formData, "scrimId"));
  if (!scrimId.success) return invalid;
  return finish(
    scrimId.data,
    await runAction(async () => {
      await cancelScrim({ userId, scrimId: scrimId.data, now: new Date() });
    }),
  );
}

export async function submitFeedbackAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  // Shape check only; outcome and rating rules live in core's feedbackInputSchema.
  const parsed = z
    .object({ scrimId: id, outcome: z.string().optional(), rating: z.string().optional() })
    .safeParse({
      scrimId: field(formData, "scrimId"),
      outcome: field(formData, "outcome"),
      rating: field(formData, "rating"),
    });
  if (!parsed.success) return invalid;
  const { scrimId, outcome, rating } = parsed.data;
  return finish(
    scrimId,
    await runAction(async () => {
      await submitFeedback({
        userId,
        scrimId,
        outcome: outcome as FeedbackOutcome,
        rating: rating ? Number(rating) : null,
        now: new Date(),
      });
    }),
  );
}
