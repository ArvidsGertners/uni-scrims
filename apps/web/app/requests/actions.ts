"use server";

import {
  acceptDirectRequest,
  applyToRequest,
  confirmApplication,
  createRequest,
  declineDirectRequest,
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
  // A direct request has no rank range (SPEC N-26); core asks for one otherwise.
  rankMin: z.string().optional(),
  rankMax: z.string().optional(),
  maps: z.array(z.string()),
  note: z.string().optional(),
  // A weekly series up to this date (SPEC N-25); empty = a single request.
  repeatUntil: z.string().optional(),
  // The team the form was shown for (§5.20).
  teamId: idSchema,
  // A direct request to this team (SPEC N-26), and its name only for the toast text.
  targetTeamId: idSchema.optional(),
  targetTeamName: z.string().max(100).optional(),
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
    targetTeamId: formField(formData, "targetTeamId"),
    targetTeamName: formField(formData, "targetTeamName"),
  });
  if (!parsed.success) return invalidInput();
  const { targetTeamName, ...input } = parsed.data;
  let weekly = false;
  const state = await runAction(async () => {
    const request = await createRequest({
      ...input,
      format: input.format as ScrimFormat,
      rankMin: input.rankMin as Rank | undefined,
      rankMax: input.rankMax as Rank | undefined,
      // Unknown map names are rejected by core's schema.
      maps: input.maps as ValorantMap[],
      userId,
      now: new Date(),
    });
    weekly = request.seriesId !== null || request.weeklyLastStartsAt !== null;
  });
  if (!state.done) return state;
  // redirect() throws, so it must stay outside runAction.
  revalidatePath("/scrims");
  const t = await getMessages(requestActionMessages);
  const target = targetTeamName ?? "";
  await setFlash(
    input.targetTeamId
      ? weekly
        ? t.partnershipProposed(target)
        : t.directSent(target)
      : weekly
        ? t.seriesCreated
        : t.requestCreated,
  );
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
    // A fixed partnership (SPEC N-26) has a toast of its own.
    await setFlash(formField(formData, "partnership") ? t.partnershipEnded : t.seriesEnded);
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

/** Accepting a direct request books the scrim (SPEC N-26); then to the scrim, like a confirmation. */
export async function acceptDirectRequestAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({
      requestId: idSchema,
      // Only for the toast text.
      teamName: z.string().max(100).optional(),
      weekly: z.string().optional(),
    })
    .safeParse({
      requestId: formField(formData, "requestId"),
      teamName: formField(formData, "teamName"),
      weekly: formField(formData, "weekly"),
    });
  if (!parsed.success) return invalidInput();
  const { requestId, teamName, weekly } = parsed.data;
  let scrimId = "";
  const state = await runAction(async () => {
    const scrim = await acceptDirectRequest({ userId, requestId, now: new Date() });
    scrimId = scrim.id;
  });
  if (!state.done) {
    revalidatePath(`/requests/${requestId}`);
    return state;
  }
  revalidatePath("/scrims");
  const t = await getMessages(requestActionMessages);
  await setFlash(weekly ? t.partnershipAccepted(teamName) : t.directAccepted(teamName));
  redirect(`/scrims/${scrimId}`);
}

export async function declineDirectRequestAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const requestId = idSchema.safeParse(formField(formData, "requestId"));
  if (!requestId.success) return invalidInput();
  const state = await runAction(async () => {
    await declineDirectRequest({ userId, requestId: requestId.data, now: new Date() });
  });
  if (!state.done) {
    revalidatePath(`/requests/${requestId.data}`);
    return state;
  }
  revalidatePath("/scrims");
  const t = await getMessages(requestActionMessages);
  await setFlash(t.directDeclined);
  redirect("/scrims?tab=anfragen");
}
