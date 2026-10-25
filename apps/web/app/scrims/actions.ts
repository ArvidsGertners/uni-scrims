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

// Both forms send the team the scrim page was shown for (§5.20).
export async function cancelScrimAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z.object({ scrimId: idSchema, teamId: idSchema }).safeParse({
    scrimId: formField(formData, "scrimId"),
    teamId: formField(formData, "teamId"),
  });
  if (!parsed.success) return invalidInput;
  const { scrimId, teamId } = parsed.data;
  return finish(
    scrimId,
    await runAction(async () => {
      await cancelScrim({ userId, teamId, scrimId, now: new Date() });
    }),
  );
}

export async function submitFeedbackAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  // Shape check only; outcome and rating rules live in core's feedbackInputSchema.
  const parsed = z
    .object({
      scrimId: idSchema,
      teamId: idSchema,
      outcome: z.string().optional(),
      rating: z.string().optional(),
    })
    .safeParse({
      scrimId: formField(formData, "scrimId"),
      teamId: formField(formData, "teamId"),
      outcome: formField(formData, "outcome"),
      rating: formField(formData, "rating"),
    });
  if (!parsed.success) return invalidInput;
  const { scrimId, teamId, outcome, rating } = parsed.data;
  const state = await finish(
    scrimId,
    await runAction(async () => {
      await submitFeedback({
        userId,
        teamId,
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
