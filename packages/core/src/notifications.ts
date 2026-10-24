// Outbox entries (ARCHITECTURE §6.1). Written in the same transaction as the domain change;
// the bot sends them later. Recipients of team notifications are resolved at send time.
import { NotifChannel, NotifStatus, type NotifType, ScrimFormat } from "@uni-scrims/db";
import { z } from "zod";
import type { Db } from "./db.ts";

// ─── Payloads ─────────────────────────────────────────────────────────────────

/** Display data of a request notification: the other team and the start. */
const requestPayloadSchema = z.object({ teamName: z.string(), startsAt: z.iso.datetime() });

/** Display data of a scrim notification, from the receiving team's point of view. */
const scrimPayloadSchema = z.object({
  opponentTeamName: z.string(),
  startsAt: z.iso.datetime(),
  format: z.enum(ScrimFormat),
});

/**
 * Payload per type. Writers are typed against it, and the sender parses with it before a message
 * is built, so web and bot agree on the shape.
 */
export const notificationPayloadSchemas = {
  VERIFICATION_RESULT: z.object({ approved: z.boolean(), rejectReason: z.string().nullable() }),
  // teamName: the applying team.
  APPLICATION_RECEIVED: requestPayloadSchema,
  // teamName: the creating team, as in the two below.
  APPLICATION_REJECTED: requestPayloadSchema,
  REQUEST_DELETED: requestPayloadSchema,
  REQUEST_EXPIRED: requestPayloadSchema,
  SCRIM_BOOKED: scrimPayloadSchema,
  // opponentTeamName: the cancelling team.
  SCRIM_CANCELLED: scrimPayloadSchema,
  REMINDER_24H: scrimPayloadSchema,
  REMINDER_1H: scrimPayloadSchema,
  FEEDBACK_PROMPT: scrimPayloadSchema,
  // teamName: the team whose channel link was removed.
  CHANNEL_BROKEN: z.object({ teamName: z.string() }),
} satisfies Record<NotifType, z.ZodType>;

export type NotificationPayload<T extends NotifType> = z.infer<
  (typeof notificationPayloadSchemas)[T]
>;

/** The payload of a stored notification, or null if it does not match its type. */
export function parseNotificationPayload<T extends NotifType>(
  type: T,
  payload: unknown,
): NotificationPayload<T> | null {
  const result = notificationPayloadSchemas[type].safeParse(payload);
  return result.success ? (result.data as NotificationPayload<T>) : null;
}

// ─── Entries ──────────────────────────────────────────────────────────────────

type EntryFields = {
  channel: NotifChannel;
  /** Triggering entity in the dedupe key, see the table in §6.1. */
  entityId: string;
  targetUserId?: string;
  targetTeamId?: string;
  scrimId?: string;
  requestId?: string;
  /** Defaults to now. */
  scheduledFor?: Date;
};

export type NotificationEntry = {
  [T in NotifType]: EntryFields & { type: T; payload: NotificationPayload<T> };
}[NotifType];

/** Omit for each member of a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Personal notifications to the team's people (fanned out when due, §5.17) and the team post. */
export const BOTH_TEAM_CHANNELS = [NotifChannel.PERSONAL, NotifChannel.TEAM_CHANNEL] as const;

/**
 * <type>:<entity>:<userId|teamId>:<channel>. Fanned-out children carry both IDs and the parent as
 * entity, so each person's copy has a key of its own (§5.17).
 */
export function dedupeKey(entry: NotificationEntry): string {
  return `${entry.type}:${entry.entityId}:${entry.targetUserId ?? entry.targetTeamId}:${entry.channel}`;
}

/** One entry per channel for a team. */
export function forTeam(
  teamId: string,
  channels: readonly NotifChannel[],
  entry: DistributiveOmit<NotificationEntry, "channel" | "targetTeamId" | "targetUserId">,
): NotificationEntry[] {
  return channels.map((channel) => ({ ...entry, channel, targetTeamId: teamId }));
}

export async function queueNotifications(
  db: Db,
  now: Date,
  entries: NotificationEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await db.notification.createMany({
    data: entries.map((entry) => ({
      type: entry.type,
      channel: entry.channel,
      targetUserId: entry.targetUserId ?? null,
      targetTeamId: entry.targetTeamId ?? null,
      scrimId: entry.scrimId ?? null,
      requestId: entry.requestId ?? null,
      payload: entry.payload,
      scheduledFor: entry.scheduledFor ?? now,
      status: NotifStatus.PENDING,
      dedupeKey: dedupeKey(entry),
      createdAt: now,
    })),
  });
}

/**
 * Pending entries of a cancelled scrim (reminders, feedback prompt, …) are no longer sent.
 * scheduledFor becomes the time of the cancellation: the purge keeps entries 30 days from there
 * (ARCHITECTURE §6.3), not from a planned send weeks ahead.
 */
export async function cancelPendingScrimNotifications(
  db: Db,
  scrimId: string,
  now: Date,
): Promise<void> {
  await db.notification.updateMany({
    where: { scrimId, status: NotifStatus.PENDING },
    data: { status: NotifStatus.CANCELLED, scheduledFor: now },
  });
}
