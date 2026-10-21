"use server";

import {
  createTeam,
  joinTeam,
  leaveTeam,
  regenerateInvite,
  removeMember,
  transferCaptain,
  updateTeam,
} from "@uni-scrims/core";
import type { Rank } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

// Shape check only; the content rules (lengths, rank) live in core's teamInputSchema.
const teamFields = z.object({ name: z.string(), tag: z.string(), rank: z.string() });
const id = z.string().min(1);

function field(formData: FormData, name: string): FormDataEntryValue | undefined {
  return formData.get(name) ?? undefined;
}

function teamInput(formData: FormData) {
  const parsed = teamFields.safeParse({
    name: field(formData, "name"),
    tag: field(formData, "tag"),
    rank: field(formData, "rank"),
  });
  return parsed.success ? { ...parsed.data, rank: parsed.data.rank as Rank } : null;
}

const invalid: ActionState = { error: "Ungültige Eingabe." };

async function finish(state: ActionState): Promise<ActionState> {
  revalidatePath("/team");
  return state;
}

export async function createTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const input = teamInput(formData);
  if (!input) return invalid;
  return finish(
    await runAction(async () => {
      await createTeam({ ...input, userId, now: new Date() });
    }),
  );
}

export async function updateTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const input = teamInput(formData);
  const teamId = id.safeParse(field(formData, "teamId"));
  if (!input || !teamId.success) return invalid;
  return finish(
    await runAction(async () => {
      await updateTeam({ ...input, userId, teamId: teamId.data });
    }),
  );
}

export async function regenerateInviteAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = id.safeParse(field(formData, "teamId"));
  if (!teamId.success) return invalid;
  return finish(
    await runAction(async () => {
      await regenerateInvite({ userId, teamId: teamId.data });
    }),
  );
}

export async function transferCaptainAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({ teamId: id, memberId: id })
    .safeParse({ teamId: field(formData, "teamId"), memberId: field(formData, "memberId") });
  if (!parsed.success) return invalid;
  return finish(
    await runAction(async () => {
      await transferCaptain({
        userId,
        teamId: parsed.data.teamId,
        newCaptainId: parsed.data.memberId,
      });
    }),
  );
}

export async function removeMemberAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({ teamId: id, memberId: id })
    .safeParse({ teamId: field(formData, "teamId"), memberId: field(formData, "memberId") });
  if (!parsed.success) return invalid;
  return finish(
    await runAction(async () => {
      await removeMember({ userId, ...parsed.data });
    }),
  );
}

export async function leaveTeamAction(_state: ActionState, _formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  return finish(
    await runAction(async () => {
      await leaveTeam({ userId, now: new Date() });
    }),
  );
}

export async function joinTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const code = id.safeParse(field(formData, "code"));
  if (!code.success) return invalid;
  const state = await runAction(async () => {
    await joinTeam({ userId, inviteCode: code.data, now: new Date() });
  });
  if (!state.done) return state;
  // redirect() throws, so it must stay outside runAction.
  revalidatePath("/team");
  redirect("/team");
}
