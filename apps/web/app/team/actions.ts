"use server";

import {
  TEAM_LINK_PLATFORMS,
  createTeam,
  joinTeam,
  leaveTeam,
  regenerateInvite,
  removeMember,
  logoBackgroundSchema,
  removeTeamLogo,
  setActiveTeam,
  setMemberRole,
  setTeamListed,
  setTeamLogo,
  transferCaptain,
  updateTeam,
  updateTeamLinks,
} from "@uni-scrims/core";
import type { MemberRole } from "@uni-scrims/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { setFlash } from "@/lib/flash";
import { teamActionMessages } from "@/i18n/team";
import { getMessages } from "@/lib/locale";
import { allowAttempt, rateLimited } from "@/lib/rate-limit";
import { getSessionUserId } from "@/lib/session";

// Shape check only; the content rules (lengths) live in core's teamInputSchema.
const teamFields = z.object({ name: z.string(), tag: z.string() });

function teamInput(formData: FormData) {
  const parsed = teamFields.safeParse({
    name: formField(formData, "name"),
    tag: formField(formData, "tag"),
  });
  return parsed.success ? parsed.data : null;
}

async function finish(state: ActionState): Promise<ActionState> {
  // Both team tabs show the members and the team (SPEC N-15), the sidebar in the root layout the
  // own teams and the active one (SPEC N-17).
  revalidatePath("/", "layout");
  return state;
}

export async function createTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const input = teamInput(formData);
  if (!input) return invalidInput();
  let teamName = "";
  const state = await runAction(async () => {
    teamName = (await createTeam({ ...input, userId, now: new Date() })).name;
  });
  if (!state.done) return state;
  await setFlash((await getMessages(teamActionMessages)).welcome(teamName));
  await finish(state);
  // The new team is the active one (SPEC N-17); from /team/new back to the team page.
  redirect("/team");
}

/** Detail pages that switch and stay (SPEC N-17); everything else opens the team page. */
const SWITCH_RETURN = /^\/(requests|scrims)\/[\w-]+$/;

/**
 * Makes another own team active (SPEC N-17) and opens the team page, or goes back to `returnTo` (the
 * hint on a scrim or request of that team). A failed switch lands there too, showing the state.
 */
export async function switchTeamAction(teamId: string, returnTo: string | null = null) {
  const userId = (await getSessionUserId()) ?? "";
  const id = idSchema.safeParse(teamId);
  if (id.success) await runAction(() => setActiveTeam({ userId, teamId: id.data }));
  // The sidebar in the root layout shows the active team.
  revalidatePath("/", "layout");
  redirect(returnTo && SWITCH_RETURN.test(returnTo) ? returnTo : "/team");
}

export async function setTeamLogoAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  const background = logoBackgroundSchema.safeParse(formField(formData, "background"));
  const file = z.instanceof(File).safeParse(formData.get("logo"));
  if (!teamId.success || !background.success) return invalidInput();
  if (!file.success || file.data.size === 0) {
    return { error: (await getMessages(teamActionMessages)).chooseImage };
  }
  if (!(await allowAttempt("logo"))) return rateLimited();
  return finish(
    await runAction(async () => {
      await setTeamLogo({
        userId,
        teamId: teamId.data,
        background: background.data,
        file: new Uint8Array(await file.data.arrayBuffer()),
        now: new Date(),
      });
    }),
  );
}

export async function removeTeamLogoAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  const background = logoBackgroundSchema.safeParse(formField(formData, "background"));
  if (!teamId.success || !background.success) return invalidInput();
  return finish(
    await runAction(async () => {
      await removeTeamLogo({
        userId,
        teamId: teamId.data,
        background: background.data,
        now: new Date(),
      });
    }),
  );
}

export async function updateTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const input = teamInput(formData);
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!input || !teamId.success) return invalidInput();
  return finish(
    await runAction(async () => {
      await updateTeam({ ...input, userId, teamId: teamId.data });
    }),
  );
}

export async function updateTeamLinksAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  // Shape check only; which addresses a platform takes is core's teamLinksSchema.
  const links = z
    .record(z.string(), z.string().optional())
    .safeParse(
      Object.fromEntries(
        TEAM_LINK_PLATFORMS.map((platform) => [platform.key, formField(formData, platform.key)]),
      ),
    );
  if (!teamId.success || !links.success) return invalidInput();
  const state = await runAction(async () => {
    await updateTeamLinks({ userId, teamId: teamId.data, links: links.data, now: new Date() });
  });
  if (state.done) await setFlash((await getMessages(teamActionMessages)).linksSaved);
  return finish(state);
}

export async function setTeamListedAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  const listed = z.enum(["true", "false"]).safeParse(formField(formData, "listed"));
  if (!teamId.success || !listed.success) return invalidInput();
  const state = await runAction(async () => {
    await setTeamListed({ userId, teamId: teamId.data, listed: listed.data === "true" });
  });
  if (state.done) {
    const t = await getMessages(teamActionMessages);
    await setFlash(listed.data === "true" ? t.listed : t.unlisted);
  }
  // finish revalidates the whole layout, the teams list included (SPEC N-20).
  return finish(state);
}

export async function regenerateInviteAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!teamId.success) return invalidInput();
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
  if (!parsed.success) return invalidInput();
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
  if (!parsed.success) return invalidInput();
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
  if (!parsed.success) return invalidInput();
  return finish(
    await runAction(async () => {
      await setMemberRole({ userId, ...parsed.data, role: parsed.data.role as MemberRole });
    }),
  );
}

export async function leaveTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const teamId = idSchema.safeParse(formField(formData, "teamId"));
  if (!teamId.success) return invalidInput();
  let dissolved = false;
  const state = await runAction(async () => {
    ({ dissolved } = await leaveTeam({ userId, teamId: teamId.data, now: new Date() }));
  });
  if (state.done) {
    const t = await getMessages(teamActionMessages);
    await setFlash(dissolved ? t.dissolved : t.left);
  }
  return finish(state);
}

export async function joinTeamAction(_state: ActionState, formData: FormData) {
  const userId = (await getSessionUserId()) ?? "";
  const code = idSchema.safeParse(formField(formData, "code"));
  if (!code.success) return invalidInput();
  let teamName = "";
  const state = await runAction(async () => {
    teamName = (await joinTeam({ userId, inviteCode: code.data, now: new Date() })).name;
  });
  if (!state.done) return state;
  await setFlash((await getMessages(teamActionMessages)).welcome(teamName));
  // redirect() throws, so it must stay outside runAction. The joined team is the active one now.
  revalidatePath("/", "layout");
  redirect("/team");
}
