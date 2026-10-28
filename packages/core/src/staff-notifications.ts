// Notifications for staff (Phase 37, SPEC N-33, ARCHITECTURE §5.35): a new case in the admin area
// goes to everyone whose role sees it, always in the bell and per setting as a Discord DM. Once the
// case is closed, its entries count as read for all of them.
import {
  NotifChannel,
  NotifType,
  type Prisma,
  ScrimStatus,
  TeamLimitStatus,
  VerifStatus,
  prisma,
} from "@uni-scrims/db";
import type { Db } from "./db.ts";
import { lockUser } from "./locks.ts";
import { clearDmFailureIfSilent, writeStored } from "./notification-settings.ts";
import {
  STAFF_NOTIFICATION_TYPES,
  type StaffNotifType,
  staffTypeRoles,
  staffTypesFor,
} from "./notification-types.ts";
import {
  type NotificationEntry,
  type NotificationPayload,
  queueNotifications,
} from "./notifications.ts";
import { STAFF_AREAS, requireStaff } from "./permissions.ts";
import { parseInput, staffNotificationPreferencesSchema } from "./schemas.ts";

export {
  PLAYER_NOTIFICATION_TYPES,
  STAFF_NOTIFICATION_TYPES,
  type StaffNotifType,
  isStaffType,
  staffTypesFor,
} from "./notification-types.ts";

type StaffEntry = {
  [T in StaffNotifType]: {
    type: T;
    /** The case in the dedupe key (§6.1): verification, report, team limit request or scrim. */
    entityId: string;
    payload: NotificationPayload<T>;
    scrimId?: string;
  };
}[StaffNotifType];

/** In the trigger's transaction: one personal entry without a target, fanned out when due. */
export async function queueStaffNotification(db: Db, now: Date, entry: StaffEntry): Promise<void> {
  // type and payload come in together, so they match.
  await queueNotifications(db, now, [
    { ...entry, channel: NotifChannel.PERSONAL } as NotificationEntry,
  ]);
}

/**
 * Whether the case is still open, before fanning out and before each DM (§5.35): a closed case is
 * not announced any more.
 */
export async function isStaffMatterOpen(
  notification: { type: StaffNotifType; payload: unknown; scrimId: string | null },
  db: Db = prisma,
): Promise<boolean> {
  const payload = notification.payload as Record<string, unknown>;
  const id = (key: string) => String(payload[key] ?? "");
  switch (notification.type) {
    case NotifType.STAFF_VERIFICATION_PENDING: {
      const request = await db.verificationRequest.findUnique({
        where: { id: id("verificationId") },
        select: { status: true },
      });
      return request?.status === VerifStatus.PENDING;
    }
    case NotifType.STAFF_MESSAGE_REPORTED: {
      // Reports are dismissed per message, and they go with a deleted message.
      const open = await db.messageReport.count({
        where: { messageId: id("messageId"), dismissedAt: null },
      });
      return open > 0;
    }
    case NotifType.STAFF_TEAM_LIMIT_REQUEST: {
      const request = await db.teamLimitRequest.findUnique({
        where: { id: id("teamLimitRequestId") },
        select: { status: true },
      });
      return request?.status === TeamLimitStatus.PENDING;
    }
    case NotifType.STAFF_DISPUTE: {
      if (!notification.scrimId) return false;
      const scrim = await db.scrim.findUnique({
        where: { id: notification.scrimId },
        select: { status: true },
      });
      return scrim?.status === ScrimStatus.DISPUTED;
    }
  }
}

/** Who may get a staff type now: a role that sees its area, 2FA set up, not banned, not deleted. */
function staffRecipientWhere(type: StaffNotifType) {
  return {
    staffRole: { in: [...staffTypeRoles(type)] },
    twoFactorEnabled: true,
    bannedAt: null,
    deletedAt: null,
  } satisfies Prisma.UserWhereInput;
}

/**
 * The recipients of a staff notification for fanOut (§5.35): their user rows are locked in id order
 * (§4) and read again under the lock, so nothing is created for an account deleted meanwhile.
 */
export async function lockStaffRecipients(
  tx: Prisma.TransactionClient,
  type: StaffNotifType,
): Promise<string[]> {
  const where = staffRecipientWhere(type);
  const candidates = await tx.user.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const { id } of candidates) await lockUser(tx, id);
  const current = await tx.user.findMany({
    where: { ...where, id: { in: candidates.map(({ id }) => id) } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return current.map(({ id }) => id);
}

/** Before a DM: the person still gets this type (role, 2FA, not banned). */
export async function isStillStaffRecipient(
  userId: string,
  type: StaffNotifType,
): Promise<boolean> {
  const count = await prisma.user.count({ where: { id: userId, ...staffRecipientWhere(type) } });
  return count > 0;
}

/** The payload field with the ID of the case; the dispute's scrim is the entry's scrimId. */
const CASE_KEYS = {
  STAFF_VERIFICATION_PENDING: "verificationId",
  STAFF_MESSAGE_REPORTED: "messageId",
  STAFF_TEAM_LIMIT_REQUEST: "teamLimitRequestId",
  STAFF_DISPUTE: null,
} as const satisfies Record<StaffNotifType, string | null>;

/**
 * The cases are closed (§5.35), in the transaction that closes them: every unread entry of them is
 * read, for everyone. `ids` are the verification, message, team limit request or scrim IDs. Returns
 * the people whose bell changed, for publishInboxChange.
 */
export async function resolveStaffItems(
  tx: Db,
  type: StaffNotifType,
  ids: readonly string[],
  now: Date,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const key = CASE_KEYS[type];
  const where: Prisma.InboxItemWhereInput = {
    type,
    readAt: null,
    ...(key === null
      ? { scrimId: { in: [...ids] } }
      : { OR: ids.map((id) => ({ payload: { path: [key], equals: id } })) }),
  };
  const items = await tx.inboxItem.findMany({ where, select: { userId: true } });
  if (items.length === 0) return [];
  await tx.inboxItem.updateMany({ where, data: { readAt: now } });
  return [...new Set(items.map(({ userId }) => userId))];
}

/** Without a role, or for a role that no longer sees an area: its entries go (§5.35). */
export async function deleteLostStaffItems(
  tx: Prisma.TransactionClient,
  userId: string,
  role: Parameters<typeof staffTypesFor>[0],
): Promise<void> {
  const kept = new Set<NotifType>(staffTypesFor(role));
  const lost = STAFF_NOTIFICATION_TYPES.map(({ type }) => type).filter((type) => !kept.has(type));
  if (lost.length === 0) return;
  await tx.inboxItem.deleteMany({ where: { userId, type: { in: lost } } });
}

/** The settings page in the admin area: Discord per type of the own areas (default on). */
export async function getStaffNotificationPreferences(staffId: string) {
  const staff = await requireStaff(staffId, STAFF_AREAS.queue);
  const types = staffTypesFor(staff.staffRole);
  const stored = await prisma.notificationPreference.findMany({
    where: { userId: staff.id, type: { in: types } },
  });
  return types.map((type) => ({
    type,
    discord: stored.find((row) => row.type === type)?.discord ?? true,
  }));
}

/**
 * Saves the staff settings form. Only the types of the own areas; a type the form did not show (the
 * role changed meanwhile) stays as it is. On is the default, so it is stored as null.
 */
export async function setStaffNotificationPreferences(input: {
  staffId: string;
  preferences: unknown;
}): Promise<void> {
  const preferences = parseInput(staffNotificationPreferencesSchema, input.preferences);
  await prisma.$transaction(async (tx) => {
    // Under the user lock, as setNotificationPreferences (§4).
    await lockUser(tx, input.staffId);
    const staff = await requireStaff(input.staffId, STAFF_AREAS.queue, tx);
    const stored = await tx.notificationPreference.findMany({ where: { userId: staff.id } });
    for (const type of staffTypesFor(staff.staffRole)) {
      const discord = preferences[type];
      if (discord === undefined) continue;
      const row = stored.find((entry) => entry.type === type);
      const next = { discord: discord ? null : false, email: row?.email ?? null };
      if (next.discord !== (row?.discord ?? null)) {
        await writeStored(tx, staff.id, type, next, row !== undefined);
      }
    }
    await clearDmFailureIfSilent(tx, staff);
  });
}
