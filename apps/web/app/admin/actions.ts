"use server";

import {
  type DisputeDecision,
  banTeam,
  banUser,
  decideTeamLimitRequest,
  decideVerification,
  removeTeamLinksAsAdmin,
  removeTeamLogoAsAdmin,
  resolveDispute,
  resolveUploadDir,
} from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

const schema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  // Length is checked by core (MAX_REJECT_REASON_LENGTH) with a specific message.
  rejectReason: z.string().optional(),
  universityId: z.string().optional(),
});

export async function decideVerificationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminId = await getSessionUserId();
  const parsed = schema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    rejectReason: formData.get("rejectReason") ?? undefined,
    universityId: formData.get("universityId") ?? undefined,
  });
  if (!parsed.success) return { error: "Ungültige Eingabe." };
  const state = await runAction(async () => {
    await decideVerification({
      ...parsed.data,
      adminId: adminId ?? "",
      uploadDir: resolveUploadDir(),
      now: new Date(),
    });
  });
  // The queue and the counts of the overview (§5.14).
  revalidatePath("/admin/queue");
  revalidatePath("/admin");
  return state;
}

const NO_SHOW_PREFIX = "NO_SHOW:";

/** Button values of the dispute form: PLAYED, UNCLEAR or NO_SHOW:<teamId>. */
function parseDisputeDecision(value: string): DisputeDecision | null {
  if (value === "PLAYED" || value === "UNCLEAR") return { decision: value };
  if (value.startsWith(NO_SHOW_PREFIX) && value.length > NO_SHOW_PREFIX.length) {
    return { decision: "NO_SHOW", noShowTeamId: value.slice(NO_SHOW_PREFIX.length) };
  }
  return null;
}

export async function resolveDisputeAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminId = (await getSessionUserId()) ?? "";
  const scrimId = idSchema.safeParse(formField(formData, "scrimId"));
  const decision = z.string().safeParse(formField(formData, "decision"));
  const parsed = decision.success ? parseDisputeDecision(decision.data) : null;
  if (!scrimId.success || !parsed) return invalidInput;
  const state = await runAction(async () => {
    await resolveDispute({ ...parsed, adminId, scrimId: scrimId.data, now: new Date() });
  });
  revalidatePath("/admin/disputes");
  return state;
}

/** Annehmen with the new limit, or Ablehnen (SPEC N-17); core checks the limit's range. */
export async function decideTeamLimitAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({
      requestId: idSchema,
      decision: z.enum(["APPROVED", "REJECTED"]),
      newLimit: z.string().optional(),
    })
    .safeParse({
      requestId: formField(formData, "requestId"),
      decision: formField(formData, "decision"),
      newLimit: formField(formData, "newLimit"),
    });
  if (!parsed.success) return invalidInput;
  const { requestId, decision, newLimit } = parsed.data;
  const state = await runAction(async () => {
    await decideTeamLimitRequest({
      adminId,
      requestId,
      decision,
      newLimit: newLimit ? Number(newLimit) : null,
      now: new Date(),
    });
  });
  revalidatePath("/admin/team-limits");
  revalidatePath("/admin");
  return state;
}

export async function banUserAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = (await getSessionUserId()) ?? "";
  const userId = idSchema.safeParse(formField(formData, "userId"));
  if (!userId.success) return invalidInput;
  const state = await runAction(async () => {
    await banUser({ adminId, userId: userId.data, uploadDir: resolveUploadDir(), now: new Date() });
  });
  revalidatePath("/admin/bans");
  return state;
}

export async function banTeamAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const adminId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!teamId.success) return invalidInput;
  const state = await runAction(async () => {
    await banTeam({ adminId, teamId: teamId.data, now: new Date() });
  });
  revalidatePath("/admin/bans");
  return state;
}

export async function removeTeamLogoAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  const logoVersion = z.coerce.number().int().safeParse(formField(formData, "logoVersion"));
  if (!teamId.success || !logoVersion.success) return invalidInput;
  const state = await runAction(async () => {
    await removeTeamLogoAsAdmin({ adminId, teamId: teamId.data, logoVersion: logoVersion.data });
  });
  revalidatePath("/admin/bans");
  return state;
}

export async function removeTeamLinksAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const adminId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  const linksVersion = z.coerce.number().int().safeParse(formField(formData, "linksVersion"));
  if (!teamId.success || !linksVersion.success) return invalidInput;
  const state = await runAction(async () => {
    await removeTeamLinksAsAdmin({
      adminId,
      teamId: teamId.data,
      linksVersion: linksVersion.data,
    });
  });
  revalidatePath("/admin/bans");
  return state;
}
