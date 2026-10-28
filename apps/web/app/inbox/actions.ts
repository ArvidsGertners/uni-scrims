"use server";

// The notification bell (SPEC N-32, §5.34): its list, read with the page's language, and reading
// entries. Called by the bell itself, not by forms; failures show an empty or unchanged bell.
import { type InboxEntry, isDomainError, listInbox, markInboxRead } from "@uni-scrims/core";
import { z } from "zod";
import { idSchema } from "@/lib/action";
import { getLocale } from "@/lib/locale";
import { publishInboxChange } from "@/lib/realtime/bus";
import { getSessionUserId } from "@/lib/session";

export type InboxListEntry = Omit<InboxEntry, "createdAt"> & { createdAt: string };

/** The newest entries, or null if they could not be read. */
export async function listInboxAction(): Promise<InboxListEntry[] | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  try {
    const entries = await listInbox({ userId, locale: await getLocale() });
    return entries.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }));
  } catch (error) {
    if (!isDomainError(error)) console.error("Could not read the bell", error);
    return null;
  }
}

const readSchema = z.object({ itemId: idSchema.optional() });

/** One entry read (a click), or without an ID all of them ("Alle als gelesen"); every tab follows. */
export async function markInboxReadAction(input: { itemId?: string }): Promise<void> {
  const userId = await getSessionUserId();
  const parsed = readSchema.safeParse(input);
  if (!userId || !parsed.success) return;
  try {
    if (await markInboxRead({ userId, itemId: parsed.data.itemId, now: new Date() })) {
      publishInboxChange(userId);
    }
  } catch (error) {
    if (!isDomainError(error)) console.error("Marking the bell read failed", error);
  }
}
