// Outbox entries (ARCHITECTURE §6.1). Written in the same transaction as the domain change;
// the bot sends them later. Recipients of team notifications are resolved at send time.
import { NotifChannel, NotifStatus, type NotifType, type Prisma } from "@uni-scrims/db";
import type { Db } from "./db.ts";

export type NotificationEntry = {
  type: NotifType;
  channel: NotifChannel;
  /** Triggering entity in the dedupe key, see the table in §6.1. */
  entityId: string;
  targetUserId?: string;
  targetTeamId?: string;
  scrimId?: string;
  requestId?: string;
  /** Display data only. */
  payload: Prisma.InputJsonObject;
  /** Defaults to now. */
  scheduledFor?: Date;
};

export const BOTH_TEAM_CHANNELS = [NotifChannel.CAPTAIN_DM, NotifChannel.TEAM_CHANNEL] as const;

/** <type>:<entity>:<teamId|userId>:<channel> */
export function dedupeKey(entry: NotificationEntry): string {
  return `${entry.type}:${entry.entityId}:${entry.targetTeamId ?? entry.targetUserId}:${entry.channel}`;
}

/** One entry per channel for a team. */
export function forTeam(
  teamId: string,
  channels: readonly NotifChannel[],
  entry: Omit<NotificationEntry, "channel" | "targetTeamId" | "targetUserId">,
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

/** Pending entries of a cancelled scrim (reminders, feedback prompt, …) are no longer sent. */
export async function cancelPendingScrimNotifications(db: Db, scrimId: string): Promise<void> {
  await db.notification.updateMany({
    where: { scrimId, status: NotifStatus.PENDING },
    data: { status: NotifStatus.CANCELLED },
  });
}
