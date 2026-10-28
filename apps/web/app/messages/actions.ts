"use server";

// Messages between teams (SPEC N-28, ARCHITECTURE §5.30). Every change is published on the bus after
// the commit, so open threads get a fresh snapshot over the WebSocket.
import {
  deleteOwnMessage,
  isDomainError,
  markConversationRead,
  reportMessage,
  sendMessage,
} from "@uni-scrims/core";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, formField, idSchema, invalidInput, runAction } from "@/lib/action";
import { allowUserAttempt, rateLimited } from "@/lib/rate-limit";
import { publishConversationChanges, publishInboxChange } from "@/lib/realtime/bus";
import { getSessionUserId } from "@/lib/session";

// The thread and the team the page acted for (§5.20).
const threadSchema = z.object({ requestId: idSchema, guestTeamId: idSchema, teamId: idSchema });

/** The pages that show threads, their counts and "Neu" markers. */
function revalidateThreads(): void {
  revalidatePath("/requests/[id]", "page");
  revalidatePath("/scrims/[id]", "page");
  revalidatePath("/scrims");
}

export async function sendMessageAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  // Shape only; the length rules live in core's messageBodySchema.
  const parsed = threadSchema.extend({ body: z.string() }).safeParse({
    requestId: formField(formData, "requestId"),
    guestTeamId: formField(formData, "guestTeamId"),
    teamId: formField(formData, "teamId"),
    body: formField(formData, "body"),
  });
  if (!parsed.success) return invalidInput();
  if (!allowUserAttempt("message", userId)) return rateLimited();
  const state = await runAction(async () => {
    publishConversationChanges([await sendMessage({ userId, ...parsed.data, now: new Date() })]);
  });
  if (state.done) revalidateThreads();
  return state;
}

export async function deleteMessageAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z
    .object({ messageId: idSchema })
    .safeParse({ messageId: formField(formData, "messageId") });
  if (!parsed.success) return invalidInput();
  const state = await runAction(async () => {
    publishConversationChanges([await deleteOwnMessage({ userId, ...parsed.data })]);
  });
  if (state.done) revalidateThreads();
  return state;
}

export async function reportMessageAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = z.object({ messageId: idSchema, teamId: idSchema }).safeParse({
    messageId: formField(formData, "messageId"),
    teamId: formField(formData, "teamId"),
  });
  if (!parsed.success) return invalidInput();
  const state = await runAction(async () => {
    publishConversationChanges([await reportMessage({ userId, ...parsed.data, now: new Date() })]);
  });
  if (state.done) revalidateThreads();
  return state;
}

/**
 * The open thread was seen; called by the thread itself, not by a form. Nothing to show on failure:
 * the next view marks it again.
 */
export async function markConversationReadAction(input: {
  requestId: string;
  guestTeamId: string;
  teamId: string;
}): Promise<void> {
  const userId = (await getSessionUserId()) ?? "";
  const parsed = threadSchema.safeParse(input);
  if (!parsed.success) return;
  try {
    const { inboxChanged } = await markConversationRead({
      userId,
      ...parsed.data,
      now: new Date(),
    });
    // Its "Neue Nachricht" entries in the bell were read too, in every tab (§5.34).
    if (inboxChanged) publishInboxChange(userId);
  } catch (error) {
    if (!isDomainError(error)) console.error("Marking a thread read failed", error);
  }
}
