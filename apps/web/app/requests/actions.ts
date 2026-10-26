"use server";

import {
  applyToRequest,
  confirmApplication,
  createRequest,
  deleteRequest,
  endRequestSeries,
  withdrawApplication,
} from "@uni-scrims/core";
import type { ValorantMap } from "@uni-scrims/core/config/maps";
import type { Rank, ScrimFormat } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { requestActionMessages } from "@/i18n/scrims";
import { setFlash } from "@/lib/flash";
import { getMessages } from "@/lib/locale";
import { getSessionUserId } from "@/lib/session";

// Shape checks only; the content rules live in core's schemas.
const requestFields = z.object({
  date: z.string(),
  time: z.string(),
  format: z.string(),
  rankMin: z.string(),
  rankMax: z.string(),
  maps: z.array(z.string()),
  note: z.string().optional(),
  // A weekly series up to this date (SPEC N-25); empty = a single request.
  repeatUntil: z.string().optional(),
  // The team the form was shown for (§5.20).
  teamId: idSchema,
});

export async function createRequestAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = requestFields.safeParse({
    date: formField(formData, "date"),
    time: formField(formData, "time"),
    format: formField(formData, "format"),
    rankMin: formField(formData, "rankMin"),
    rankMax: formField(formData, "rankMax"),
    maps: formData.getAll("maps"),
    note: formField(formData, "note"),
    repeatUntil: formField(formData, "repeatUntil"),
    teamId: formField(formData, "teamId"),
  });
  if (!parsed.success) return invalidInput();
  let weekly = false;
  const state = await runAction(async () => {
    const request = await createRequest({
      ...parsed.data,
      format: parsed.data.format as ScrimFormat,
      rankMin: parsed.data.rankMin as Rank,
      rankMax: parsed.data.rankMax as Rank,
      // Unknown map names are rejected by core's schema.
      maps: parsed.data.maps as ValorantMap[],
      userId,
      now: new Date(),
    });
    weekly = request.seriesId !== null;
  });
  if (!state.done) return state;
  // redirect() throws, so it must stay outside runAction.
  revalidatePath("/scrims");
  const t = await getMessages(requestActionMessages);
  await setFlash(weekly ? t.seriesCreated : t.requestCreated);
  redirect("/scrims?tab=anfragen");
}

export async function endRequestSeriesAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const seriesId = idSchema.safeParse(formField(formData, "seriesId"));
  if (!seriesId.success) return invalidInput();
  const state = await runAction(async () => {
    await endRequestSeries({ userId, seriesId: seriesId.data, now: new Date() });
  });
  if (state.done) {
    const t = await getMessages(requestActionMessages);
    await setFlash(t.seriesEnded);
  }
  revalidatePath("/scrims");
  return state;
}

export async function deleteRequestAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const requestId = idSchema.safeParse(formField(formData, "requestId"));
  if (!requestId.success) return invalidInput();
  const state = await runAction(async () => {
    await deleteRequest({ userId, requestId: requestId.data, now: new Date() });
  });
  if (!state.done) return state;
  revalidatePath("/scrims");
  const t = await getMessages(requestActionMessages);
  await setFlash(t.requestWithdrawn);
  redirect("/scrims?tab=anfragen");
}

export async function applyAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({
      requestId: idSchema,
      // The team the request page was shown for (§5.20).
      teamId: idSchema,
      message: z.string().optional(),
      // Only for the toast text.
      teamName: z.string().max(100).optional(),
    })
    .safeParse({
      requestId: formField(formData, "requestId"),
      teamId: formField(formData, "teamId"),
      message: formField(formData, "message"),
      teamName: formField(formData, "teamName"),
    });
  if (!parsed.success) return invalidInput();
  const { requestId, teamId, message, teamName } = parsed.data;
  const state = await runAction(async () => {
    await applyToRequest({ userId, teamId, requestId, message, now: new Date() });
  });
  if (state.done) {
    const t = await getMessages(requestActionMessages);
    await setFlash(t.applicationSent(teamName));
  }
  revalidatePath(`/requests/${requestId}`);
  return state;
}

export async function withdrawApplicationAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z.object({ requestId: idSchema, applicationId: idSchema }).safeParse({
    requestId: formField(formData, "requestId"),
    applicationId: formField(formData, "applicationId"),
  });
  if (!parsed.success) return invalidInput();
  const state = await runAction(async () => {
    await withdrawApplication({
      userId,
      applicationId: parsed.data.applicationId,
      now: new Date(),
    });
  });
  revalidatePath(`/requests/${parsed.data.requestId}`);
  return state;
}

export async function confirmApplicationAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({
      requestId: idSchema,
      applicationId: idSchema,
      // Only for the toast text.
      teamName: z.string().max(100).optional(),
    })
    .safeParse({
      requestId: formField(formData, "requestId"),
      applicationId: formField(formData, "applicationId"),
      teamName: formField(formData, "teamName"),
    });
  if (!parsed.success) return invalidInput();
  const { requestId, applicationId, teamName } = parsed.data;
  let scrimId = "";
  const state = await runAction(async () => {
    const scrim = await confirmApplication({ userId, requestId, applicationId, now: new Date() });
    scrimId = scrim.id;
  });
  if (!state.done) {
    revalidatePath(`/requests/${requestId}`);
    return state;
  }
  revalidatePath("/scrims");
  const t = await getMessages(requestActionMessages);
  await setFlash(t.applicationAccepted(teamName));
  redirect(`/scrims/${scrimId}`);
}
