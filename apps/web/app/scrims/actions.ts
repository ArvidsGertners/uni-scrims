"use server";

import { cancelScrim, submitFeedback } from "@uni-scrims/core";
import type { FeedbackOutcome } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { getSessionUserId } from "@/lib/session";

async function finish(scrimId: string, state: ActionState): Promise<ActionState> {
  revalidatePath(`/scrims/${scrimId}`);
  revalidatePath("/scrims");
  return state;
}

export async function cancelScrimAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const scrimId = idSchema.safeParse(formField(formData, "scrimId"));
  if (!scrimId.success) return invalidInput;
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
    .object({ scrimId: idSchema, outcome: z.string().optional(), rating: z.string().optional() })
    .safeParse({
      scrimId: formField(formData, "scrimId"),
      outcome: formField(formData, "outcome"),
      rating: formField(formData, "rating"),
    });
  if (!parsed.success) return invalidInput;
  const { scrimId, outcome, rating } = parsed.data;
  const state = await finish(
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
  if (!state.done) return state;
  // redirect() throws, so it must stay outside runAction.
  await setFlash("Danke für dein Feedback!");
  redirect("/scrims?tab=vergangen");
}
