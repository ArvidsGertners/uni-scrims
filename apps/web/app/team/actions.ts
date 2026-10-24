"use server";

import {
  createTeam,
  joinTeam,
  leaveTeam,
  regenerateInvite,
  removeMember,
  removeTeamLogo,
  setMemberRole,
  setTeamLogo,
  transferCaptain,
  updateTeam,
} from "@uni-scrims/core";
import type { MemberRole, Rank } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { RATE_LIMITED, allowAttempt } from "@/lib/rate-limit";
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
  let teamName = "";
  const state = await runAction(async () => {
    teamName = (await createTeam({ ...input, userId, now: new Date() })).name;
  });
  if (state.done) await setFlash(`Willkommen bei ${teamName}`);
  return finish(state);
}

export async function setTeamLogoAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  const file = z.instanceof(File).safeParse(formData.get("logo"));
  if (!teamId.success) return invalidInput;
  if (!file.success || file.data.size === 0) return { error: "Bitte wähle ein Bild aus." };
  if (!(await allowAttempt("logo"))) return { error: RATE_LIMITED };
  return finish(
    await runAction(async () => {
      await setTeamLogo({
        userId,
        teamId: teamId.data,
        file: new Uint8Array(await file.data.arrayBuffer()),
        now: new Date(),
      });
    }),
  );
}

export async function removeTeamLogoAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!teamId.success) return invalidInput;
  return finish(
    await runAction(async () => {
      await removeTeamLogo({ userId, teamId: teamId.data });
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

export async function setMemberRoleAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  // Shape check only; core validates the role.
  const parsed = z.object({ teamId: idSchema, memberId: idSchema, role: z.string() }).safeParse({
    teamId: formField(formData, "teamId"),
    memberId: formField(formData, "memberId"),
    role: formField(formData, "role"),
  });
  if (!parsed.success) return invalidInput;
  return finish(
    await runAction(async () => {
      await setMemberRole({ userId, ...parsed.data, role: parsed.data.role as MemberRole });
    }),
  );
}

export async function leaveTeamAction(_state: ActionState, _formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  let dissolved = false;
  const state = await runAction(async () => {
    ({ dissolved } = await leaveTeam({ userId, now: new Date() }));
  });
  if (state.done) {
    await setFlash(dissolved ? "Du hast das Team aufgelöst" : "Du hast das Team verlassen");
  }
  return finish(state);
}

export async function joinTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const code = idSchema.safeParse(formField(formData, "code"));
  if (!code.success) return invalidInput;
  let teamName = "";
  const state = await runAction(async () => {
    teamName = (await joinTeam({ userId, inviteCode: code.data, now: new Date() })).name;
  });
  if (!state.done) return state;
  await setFlash(`Willkommen bei ${teamName}`);
  // redirect() throws, so it must stay outside runAction.
  revalidatePath("/team");
  redirect("/team");
}
