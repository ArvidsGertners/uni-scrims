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
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { getSessionUserId } from "@/lib/session";

// Shape check only; the content rules (lengths, rank) live in core's teamInputSchema.
const teamFields = z.object({ name: z.string(), tag: z.string(), rank: z.string() });

function teamInput(formData: FormData) {
  const parsed = teamFields.safeParse({
    name: formField(formData, "name"),
    tag: formField(formData, "tag"),
    rank: formField(formData, "rank"),
  });
  return parsed.success ? { ...parsed.data, rank: parsed.data.rank as Rank } : null;
}

async function finish(state: ActionState): Promise<ActionState> {
  revalidatePath("/team");
  return state;
}

export async function createTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const input = teamInput(formData);
  if (!input) return invalidInput;
  return finish(
    await runAction(async () => {
      await createTeam({ ...input, userId, now: new Date() });
    }),
  );
}

export async function updateTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const input = teamInput(formData);
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!input || !teamId.success) return invalidInput;
  return finish(
    await runAction(async () => {
      await updateTeam({ ...input, userId, teamId: teamId.data });
    }),
  );
}

export async function regenerateInviteAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!teamId.success) return invalidInput;
  return finish(
    await runAction(async () => {
      await regenerateInvite({ userId, teamId: teamId.data });
    }),
  );
}

export async function transferCaptainAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z.object({ teamId: idSchema, memberId: idSchema }).safeParse({
    teamId: formField(formData, "teamId"),
    memberId: formField(formData, "memberId"),
  });
  if (!parsed.success) return invalidInput;
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
  const parsed = z.object({ teamId: idSchema, memberId: idSchema }).safeParse({
    teamId: formField(formData, "teamId"),
    memberId: formField(formData, "memberId"),
  });
  if (!parsed.success) return invalidInput;
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
  const code = idSchema.safeParse(formField(formData, "code"));
  if (!code.success) return invalidInput;
  const state = await runAction(async () => {
    await joinTeam({ userId, inviteCode: code.data, now: new Date() });
  });
  if (!state.done) return state;
  // redirect() throws, so it must stay outside runAction.
  revalidatePath("/team");
  redirect("/team");
}
