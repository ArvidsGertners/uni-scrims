// The notification bell (SPEC N-32, ARCHITECTURE §5.34): one entry per person and fanned-out
// notification, written by fanOut whatever the person's Discord and mail settings are.
import { NotifType, type Prisma, prisma } from "@uni-scrims/db";
import { INBOX_LIST_MAX, INBOX_RETENTION_DAYS } from "../config/limits.ts";
import type { Locale } from "../config/locale.ts";
import { notificationSummary, plainSummaryFormat } from "./notification-text.ts";
import { type NotificationPayload, parseNotificationPayload } from "./notifications.ts";
import { requireUser } from "./permissions.ts";

const DAY = 24 * 60 * 60 * 1000;

/**
 * In fanOut, under its team or user lock and only once the parent was settled: one entry per
 * recipient. skipDuplicates on (sourceId, userId), so an entry fanned out again changes nothing.
 */
export async function writeInboxItems<T extends NotifType>(
  tx: Prisma.TransactionClient,
  notification: {
    id: string;
    type: T;
    targetTeamId: string | null;
    requestId: string | null;
    scrimId: string | null;
    createdAt: Date;
  },
  payload: NotificationPayload<T>,
  recipients: readonly { userId: string }[],
  now: Date,
): Promise<void> {
  if (recipients.length === 0) return;
  const readAt = await threadReadSince(tx, notification, payload, recipients);
  await tx.inboxItem.createMany({
    data: recipients.map(({ userId }) => ({
      readAt: readAt.get(userId) ?? null,
      userId,
      type: notification.type,
      teamId: notification.targetTeamId,
      requestId: notification.requestId,
      scrimId: notification.scrimId,
      sourceId: notification.id,
      payload: payload as Prisma.InputJsonValue,
      createdAt: now,
    })),
    skipDuplicates: true,
  });
}

/**
 * A "Neue Nachricht" for someone who read the thread since the message (live, before the bot fanned
 * it out) arrives read (SPEC N-32): when they read it, per recipient.
 */
async function threadReadSince<T extends NotifType>(
  tx: Prisma.TransactionClient,
  notification: { type: T; requestId: string | null; createdAt: Date },
  payload: NotificationPayload<T>,
  recipients: readonly { userId: string }[],
): Promise<Map<string, Date>> {
  if (notification.type !== NotifType.MESSAGE_RECEIVED || !notification.requestId) return new Map();
  const { guestTeamId } = payload as NotificationPayload<typeof NotifType.MESSAGE_RECEIVED>;
  const reads = await tx.conversationRead.findMany({
    where: {
      userId: { in: recipients.map(({ userId }) => userId) },
      readAt: { gte: notification.createdAt },
      conversation: { requestId: notification.requestId, guestTeamId },
    },
    select: { userId: true, readAt: true },
  });
  return new Map(reads.map(({ userId, readAt }) => [userId, readAt]));
}

export type InboxEntry = {
  id: string;
  type: NotifType;
  title: string;
  description: string;
  /** A path into the web app, or with `admin` into the admin area (Phase 37, §5.35). */
  href: string;
  admin: boolean;
  createdAt: Date;
  read: boolean;
};

type StoredItem = {
  id: string;
  type: NotifType;
  payload: Prisma.JsonValue;
  requestId: string | null;
  scrimId: string | null;
  createdAt: Date;
  readAt: Date | null;
};

/** Title, text and link of an entry in a language; null if its payload does not match its type. */
export function inboxItemView(item: StoredItem, locale: Locale): InboxEntry | null {
  const payload = parseNotificationPayload(item.type, item.payload);
  if (!payload) return null;
  const summary = notificationSummary(
    item.type,
    payload,
    { requestId: item.requestId, scrimId: item.scrimId, locale },
    plainSummaryFormat,
  );
  return {
    id: item.id,
    type: item.type,
    title: summary.title,
    description: summary.description,
    href: summary.link.path,
    admin: summary.link.host === "admin",
    createdAt: item.createdAt,
    read: item.readAt !== null,
  };
}

/** The person's newest entries, newest first, in the page's language. */
export async function listInbox(input: { userId: string; locale: Locale }): Promise<InboxEntry[]> {
  const user = await requireUser(input.userId);
  const items = await prisma.inboxItem.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: INBOX_LIST_MAX,
    select: {
      id: true,
      type: true,
      payload: true,
      requestId: true,
      scrimId: true,
      createdAt: true,
      readAt: true,
    },
  });
  return items.flatMap((item) => inboxItemView(item, input.locale) ?? []);
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.inboxItem.count({ where: { userId, readAt: null } });
}

export type InboxState = {
  unread: number;
  /** When the newest unread entry arrived; with the count it tells the WebSocket server a change. */
  latest: Date | null;
};

/** For the WebSocket server (§5.34): one query for all connected people; missing ones have none. */
export async function inboxStates(userIds: readonly string[]): Promise<Map<string, InboxState>> {
  const states = new Map<string, InboxState>(
    userIds.map((userId) => [userId, { unread: 0, latest: null }]),
  );
  if (userIds.length === 0) return states;
  const groups = await prisma.inboxItem.groupBy({
    by: ["userId"],
    where: { userId: { in: [...userIds] }, readAt: null },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  for (const group of groups) {
    states.set(group.userId, { unread: group._count._all, latest: group._max.createdAt });
  }
  return states;
}

/**
 * One own entry read, or without itemId all of them (SPEC N-32: on a click, "Alle als gelesen").
 * Whether anything changed.
 */
export async function markInboxRead(input: {
  userId: string;
  itemId?: string;
  now: Date;
}): Promise<boolean> {
  const user = await requireUser(input.userId);
  const { count } = await prisma.inboxItem.updateMany({
    where: {
      userId: user.id,
      readAt: null,
      ...(input.itemId ? { id: input.itemId } : {}),
    },
    data: { readAt: input.now },
  });
  return count > 0;
}

/**
 * Reading a thread reads its "Neue Nachricht" entries too (SPEC N-32): the person's unread
 * MESSAGE_RECEIVED entries for this team, request and guest team. Whether anything changed.
 */
export async function markMessageItemsRead(
  tx: Prisma.TransactionClient,
  input: { userId: string; teamId: string; requestId: string; guestTeamId: string; now: Date },
): Promise<boolean> {
  const { count } = await tx.inboxItem.updateMany({
    where: {
      userId: input.userId,
      teamId: input.teamId,
      requestId: input.requestId,
      type: NotifType.MESSAGE_RECEIVED,
      readAt: null,
      payload: { path: ["guestTeamId"], equals: input.guestTeamId },
    },
    data: { readAt: input.now },
  });
  return count > 0;
}

/**
 * Who leaves a team, is removed, dissolves it or loses it with a ban loses its entries (§5.34), in
 * the transaction that ends the membership.
 */
export async function deleteTeamInboxItems(
  tx: Prisma.TransactionClient,
  teamId: string,
  userIds: readonly string[],
): Promise<void> {
  if (userIds.length === 0) return;
  await tx.inboxItem.deleteMany({ where: { teamId, userId: { in: [...userIds] } } });
}

/** Sweeper step 10 (§6.3): entries that arrived more than INBOX_RETENTION_DAYS ago. */
export async function purgeOldInbox(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - INBOX_RETENTION_DAYS * DAY);
  const { count } = await prisma.inboxItem.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}
