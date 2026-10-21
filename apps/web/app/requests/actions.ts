"use server";

import {
  applyToRequest,
  confirmApplication,
  createRequest,
  deleteRequest,
  withdrawApplication,
} from "@uni-scrims/core";
import type { ValorantMap } from "@uni-scrims/core/config/maps";
import type { Rank, ScrimFormat } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

// Shape checks only; the content rules live in core's schemas.
const id = z.string().min(1);
const requestFields = z.object({
  date: z.string(),
  time: z.string(),
  format: z.string(),
  rankMin: z.string(),
  rankMax: z.string(),
  maps: z.array(z.string()),
  note: z.string().optional(),
});

const invalid: ActionState = { error: "Ungültige Eingabe." };

function field(formData: FormData, name: string): FormDataEntryValue | undefined {
  return formData.get(name) ?? undefined;
}

export async function createRequestAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = requestFields.safeParse({
    date: field(formData, "date"),
    time: field(formData, "time"),
    format: field(formData, "format"),
    rankMin: field(formData, "rankMin"),
    rankMax: field(formData, "rankMax"),
    maps: formData.getAll("maps"),
    note: field(formData, "note"),
  });
  if (!parsed.success) return invalid;
  let requestId = "";
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
    requestId = request.id;
  });
  if (!state.done) return state;
  // redirect() throws, so it must stay outside runAction.
  revalidatePath("/board");
  redirect(`/requests/${requestId}`);
}

export async function deleteRequestAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const requestId = id.safeParse(field(formData, "requestId"));
  if (!requestId.success) return invalid;
  const state = await runAction(async () => {
    await deleteRequest({ userId, requestId: requestId.data, now: new Date() });
  });
  if (!state.done) return state;
  revalidatePath("/board");
  redirect("/board");
}

export async function applyAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({ requestId: id, message: z.string().optional() })
    .safeParse({ requestId: field(formData, "requestId"), message: field(formData, "message") });
  if (!parsed.success) return invalid;
  const state = await runAction(async () => {
    await applyToRequest({ userId, ...parsed.data, now: new Date() });
  });
  revalidatePath(`/requests/${parsed.data.requestId}`);
  return state;
}

export async function withdrawApplicationAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z.object({ requestId: id, applicationId: id }).safeParse({
    requestId: field(formData, "requestId"),
    applicationId: field(formData, "applicationId"),
  });
  if (!parsed.success) return invalid;
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
  const parsed = z.object({ requestId: id, applicationId: id }).safeParse({
    requestId: field(formData, "requestId"),
    applicationId: field(formData, "applicationId"),
  });
  if (!parsed.success) return invalid;
  let scrimId = "";
  const state = await runAction(async () => {
    const scrim = await confirmApplication({ userId, ...parsed.data, now: new Date() });
    scrimId = scrim.id;
  });
  if (!state.done) {
    revalidatePath(`/requests/${parsed.data.requestId}`);
    return state;
  }
  revalidatePath("/board");
  redirect(`/scrims/${scrimId}`);
}
