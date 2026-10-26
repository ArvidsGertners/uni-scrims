// Outbox sender logic (ARCHITECTURE §6.2): relevance, recipients, results and retries.
// The bot passes a Deliver function that turns an OutboxMessage into a Discord message and reports
// what Discord answered. No transaction is held during the Discord call; results are only written
// while the entry is still PENDING, so an entry cancelled meanwhile (e.g. by cancelScrim) stays so.
import {
  NotifChannel,
  NotifStatus,
  NotifType,
  type Prisma,
  type RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { type DevEnv, getDevChannelId, getDevDmRedirectId } from "../config/dev.ts";
import type { Db } from "./db.ts";
import { lockTeam, lockUser } from "./locks.ts";
import { effectiveChannels, notificationAudience } from "./notification-settings.ts";
import {
  type NotificationEntry,
  type NotificationPayload,
  parseNotificationPayload,
  queueNotifications,
} from "./notifications.ts";
import { requireAdmin } from "./permissions.ts";
import { isTeamActive } from "./readiness.ts";
import { isRequestOpen } from "./requests.ts";
import { feedbackClosedReason } from "./scrims.ts";
import { deliverableEmail, getDiscordId, notDeletedUserWhere } from "./users.ts";
import { DEFAULT_LOCALE, type Locale } from "../config/locale.ts";
import { fromDbLocale } from "./i18n/locale.ts";

const MINUTE = 60 * 1000;

/** Failed sends 1–5 are retried after 1, 2, 4, 8 and 16 minutes; the 6th sets FAILED (§6.2). */
export const MAX_RETRIES = 5;

export function retryDelayMs(failedSends: number): number {
  return 2 ** (failedSends - 1) * MINUTE;
}

/** Discord error codes with their own handling (§6.2). */
export const DISCORD_ERROR = {
  CANNOT_DM_USER: 50007,
  UNKNOWN_CHANNEL: 10003,
  MISSING_ACCESS: 50001,
  MISSING_PERMISSIONS: 50013,
} as const;

const CHANNEL_ERRORS: readonly number[] = [
  DISCORD_ERROR.UNKNOWN_CHANNEL,
  DISCORD_ERROR.MISSING_ACCESS,
  DISCORD_ERROR.MISSING_PERMISSIONS,
];

export type DeliveryFailure = "DM_BLOCKED" | "CHANNEL_BROKEN" | "RETRY";

/**
 * 50007 on a DM and the channel errors on a team channel are final; everything else is retried,
 * every mail error too (§5.17).
 */
export function classifyDeliveryError(channel: NotifChannel, code: number | null): DeliveryFailure {
  if (channel === NotifChannel.USER_EMAIL) return "RETRY";
  if (channel === NotifChannel.TEAM_CHANNEL) {
    return code !== null && CHANNEL_ERRORS.includes(code) ? "CHANNEL_BROKEN" : "RETRY";
  }
  return code === DISCORD_ERROR.CANNOT_DM_USER ? "DM_BLOCKED" : "RETRY";
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export type Recipient =
  /** userId: whose dmFailedAt the result updates, unless the DM was redirected in development. */
  | { kind: "DM"; userId: string; discordId: string; redirectedFrom: string | null }
  | { kind: "CHANNEL"; channelId: string; redirectedFrom: string | null }
  /** A notification mail; sendMail itself redirects it in development (§5.17). */
  | { kind: "EMAIL"; userId: string; email: string; redirectedFrom: null };

/** What the bot needs to build one message. */
export type OutboxMessage = {
  [T in NotifType]: {
    id: string;
    type: T;
    payload: NotificationPayload<T>;
    recipient: Recipient;
    requestId: string | null;
    scrimId: string | null;
    /** Scrim notifications: the other team's current captain (SPEC P0-6, §6.1). */
    opponentCaptain: { name: string; discordId: string | null } | null;
    feedbackDeadline: Date | null;
    /** The recipient's language, for a team channel its captain's, at sending (§5.22). */
    locale: Locale;
  };
}[NotifType];

/** Must not throw: Discord errors come back with their code, other errors with code null. */
export type Deliver = (message: OutboxMessage) => Promise<DeliveryResult>;

export type DeliveryResult = { ok: true } | { ok: false; code: number | null; error: string };

/** DISTRIBUTED: a personal notification was fanned out into its children (§5.17). */
export type DeliveryOutcome = "SENT" | "DISTRIBUTED" | "CANCELLED" | "FAILED" | "RETRY";

// ─── Relevance ────────────────────────────────────────────────────────────────

type TeamState = { bannedAt: Date | null; dissolvedAt: Date | null };

type RelevanceInput = {
  type: NotifType;
  targetTeamId: string | null;
  targetTeam: TeamState | null;
  request: { status: RequestStatus; startsAt: Date } | null;
  scrim: {
    status: ScrimStatus;
    startsAt: Date;
    feedbackDeadline: Date;
    hostTeam: TeamState;
    guestTeam: TeamState;
    feedback: { teamId: string }[];
  } | null;
};

/**
 * The relevance check of §6.1 right before sending; on top, the receiving team is not dissolved.
 * The checks only use the stored state and `now`, so the result does not depend on whether the
 * sweeper has run yet (e.g. right after a restart). VERIFICATION_RESULT has no check here:
 * deleteAccount removes the user's notifications (§5.5).
 */
export function isNotificationRelevant(notification: RelevanceInput, now: Date): boolean {
  if (notification.targetTeam?.dissolvedAt) return false;
  const { request, scrim } = notification;
  const bothTeamsActive = !!scrim && isTeamActive(scrim.hostTeam) && isTeamActive(scrim.guestTeam);
  switch (notification.type) {
    case NotifType.APPLICATION_RECEIVED:
    case NotifType.DIRECT_REQUEST_RECEIVED:
      return !!request && isRequestOpen(request, now);
    case NotifType.SCRIM_BOOKED:
      return scrim?.status === ScrimStatus.SCHEDULED && bothTeamsActive;
    case NotifType.REMINDER_24H:
    case NotifType.REMINDER_1H:
      // Also drops reminders that are retried or caught up after the start.
      return scrim?.status === ScrimStatus.SCHEDULED && scrim.startsAt > now && bothTeamsActive;
    case NotifType.FEEDBACK_PROMPT:
      // Only while feedback can be given (until the deadline) and this team has not answered.
      return (
        !!scrim &&
        feedbackClosedReason(scrim, now) === null &&
        !scrim.feedback.some((answer) => answer.teamId === notification.targetTeamId)
      );
    default:
      return true;
  }
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

/** Entries the sender fans out into one entry per person and channel (§5.17). */
const PERSONAL_CHANNELS: readonly NotifChannel[] = [NotifChannel.PERSONAL, NotifChannel.CAPTAIN_DM];

const teamWithCaptain = {
  select: {
    id: true,
    name: true,
    bannedAt: true,
    dissolvedAt: true,
    discordChannelId: true,
    captain: { select: { id: true, name: true, locale: true } },
  },
} as const;

async function loadNotification(id: string) {
  return prisma.notification.findUnique({
    where: { id },
    include: {
      targetUser: {
        select: { id: true, name: true, email: true, emailVerified: true, locale: true },
      },
      targetTeam: teamWithCaptain,
      request: { select: { status: true, startsAt: true } },
      scrim: {
        select: {
          status: true,
          startsAt: true,
          feedbackDeadline: true,
          hostTeam: teamWithCaptain,
          guestTeam: teamWithCaptain,
          feedback: { select: { teamId: true } },
        },
      },
    },
  });
}

type LoadedNotification = NonNullable<Awaited<ReturnType<typeof loadNotification>>>;

/**
 * USER_DM: the user; USER_EMAIL: the user's deliverable address; TEAM_CHANNEL: the linked channel.
 * PERSONAL and CAPTAIN_DM entries are fanned out before (§5.17).
 * In development, DEV_DM_REDIRECT_DISCORD_ID and DEV_CHANNEL_ID take every DM and every team post.
 * null if there is nobody to send to.
 */
async function resolveRecipient(
  notification: LoadedNotification,
  env: DevEnv,
): Promise<Recipient | null> {
  const team = notification.targetTeam;
  if (notification.channel === NotifChannel.TEAM_CHANNEL) {
    if (!team) return null;
    const devChannelId = getDevChannelId(env);
    if (devChannelId)
      return { kind: "CHANNEL", channelId: devChannelId, redirectedFrom: team.name };
    return team.discordChannelId
      ? { kind: "CHANNEL", channelId: team.discordChannelId, redirectedFrom: null }
      : null;
  }
  if (notification.channel === NotifChannel.USER_EMAIL) {
    const target = notification.targetUser;
    const email = target ? deliverableEmail(target) : null;
    return target && email
      ? { kind: "EMAIL", userId: target.id, email, redirectedFrom: null }
      : null;
  }
  const user = notification.targetUser;
  if (!user) return null;
  const discordId = await getDiscordId(user.id);
  if (!discordId) return null;
  const devDiscordId = getDevDmRedirectId(env);
  return devDiscordId
    ? { kind: "DM", userId: user.id, discordId: devDiscordId, redirectedFrom: user.name }
    : { kind: "DM", userId: user.id, discordId, redirectedFrom: null };
}

/**
 * The language of a message (§5.22): the person's own, a team channel post in its captain's; German
 * without a stored one. Read at sending, like the recipients.
 */
function messageLocale(notification: LoadedNotification): Locale {
  const stored =
    notification.channel === NotifChannel.TEAM_CHANNEL
      ? notification.targetTeam?.captain.locale
      : notification.targetUser?.locale;
  return fromDbLocale(stored ?? null) ?? DEFAULT_LOCALE;
}

async function opponentCaptain(notification: LoadedNotification) {
  const { scrim, targetTeamId } = notification;
  if (!scrim || !targetTeamId) return null;
  const opponent = scrim.hostTeam.id === targetTeamId ? scrim.guestTeam : scrim.hostTeam;
  return { name: opponent.captain.name, discordId: await getDiscordId(opponent.captain.id) };
}

/** Writes a result only while the entry is still PENDING; false if it was not written. */
async function settle(
  db: Db,
  id: string,
  data: Prisma.NotificationUpdateManyMutationInput,
): Promise<boolean> {
  const updated = await db.notification.updateMany({
    where: { id, status: NotifStatus.PENDING },
    data,
  });
  return updated.count > 0;
}

const MAX_ERROR_LENGTH = 500;

/** dmFailedAt drives the banner (§5.1); a redirected dev DM says nothing about the user. */
async function recordDmResult(recipient: Recipient, dmFailedAt: Date | null): Promise<void> {
  if (recipient.kind !== "DM" || recipient.redirectedFrom !== null) return;
  // updateMany: an account deleted during the send keeps dmFailedAt at null (§4).
  await prisma.user.updateMany({
    where: notDeletedUserWhere(recipient.userId),
    data: { dmFailedAt },
  });
}

/** null if the entry was no longer pending, so nothing was written. */
async function recordFailure(
  notification: LoadedNotification,
  recipient: Recipient,
  result: Extract<DeliveryResult, { ok: false }>,
  now: Date,
): Promise<DeliveryOutcome | null> {
  const failedSends = notification.attempts + 1;
  const lastError = result.error.slice(0, MAX_ERROR_LENGTH);
  // A failed entry is never sent again, so scheduledFor keeps the time of the last attempt: the
  // admin list sorts by it and the purge keeps the entry 30 days from then (§6.3).
  const failed = {
    status: NotifStatus.FAILED,
    attempts: failedSends,
    lastError,
    scheduledFor: now,
  };
  const outcome = (settled: boolean, value: DeliveryOutcome) => (settled ? value : null);
  switch (classifyDeliveryError(notification.channel, result.code)) {
    case "DM_BLOCKED": {
      // The DM failed regardless of the entry's state, so the banner shows either way.
      await recordDmResult(recipient, now);
      return outcome(await settle(prisma, notification.id, failed), "FAILED");
    }
    case "CHANNEL_BROKEN": {
      const team = notification.targetTeam;
      const settled = await prisma.$transaction(async (tx) => {
        // Team before notifications, as in leaveTeam and dissolveTeam, so the two cannot deadlock.
        if (team) await lockTeam(tx, team.id);
        const written = await settle(tx, notification.id, failed);
        if (!team || recipient.kind !== "CHANNEL") return written;
        // Only the link that failed: not one set again by /setup meanwhile, not the dev channel.
        // So the captain is told once, even if several posts fail on the same channel.
        const unlinked = await tx.team.updateMany({
          where: { id: team.id, discordChannelId: recipient.channelId },
          data: { discordChannelId: null },
        });
        if (unlinked.count > 0) {
          await queueNotifications(tx, now, [
            {
              type: NotifType.CHANNEL_BROKEN,
              channel: NotifChannel.PERSONAL,
              entityId: notification.id,
              targetTeamId: team.id,
              payload: { teamName: team.name },
            },
          ]);
        }
        return written;
      });
      return outcome(settled, "FAILED");
    }
    case "RETRY":
      if (failedSends > MAX_RETRIES) {
        return outcome(await settle(prisma, notification.id, failed), "FAILED");
      }
      return outcome(
        await settle(prisma, notification.id, {
          attempts: failedSends,
          lastError,
          scheduledFor: new Date(now.getTime() + retryDelayMs(failedSends)),
        }),
        "RETRY",
      );
  }
}

/**
 * Fans a personal notification out into USER_DM and USER_EMAIL children, one per person and channel
 * switched on (§5.17): the person for SELF types, the current captain for CAPTAIN types, every
 * member for TEAM types. Under the team or user lock (§4), so it sees the current members and no
 * child is created for an account deleted meanwhile. The parent becomes SENT as distributed, or
 * CANCELLED without a single child; null if it was no longer pending.
 */
async function fanOut(
  notification: LoadedNotification,
  payload: NotificationPayload<NotifType>,
  now: Date,
): Promise<DeliveryOutcome | null> {
  return prisma.$transaction(async (tx) => {
    let recipients: { userId: string; isCaptain: boolean }[] = [];
    if (notification.targetTeamId) {
      await lockTeam(tx, notification.targetTeamId);
      const team = await tx.team.findUnique({
        where: { id: notification.targetTeamId },
        select: { captainId: true, dissolvedAt: true, members: { select: { userId: true } } },
      });
      if (team && !team.dissolvedAt) {
        recipients =
          notificationAudience(notification.type) === "TEAM"
            ? team.members.map(({ userId }) => ({ userId, isCaptain: userId === team.captainId }))
            : [{ userId: team.captainId, isCaptain: true }];
      }
    } else if (notification.targetUserId) {
      await lockUser(tx, notification.targetUserId);
      const user = await tx.user.findFirst({
        where: notDeletedUserWhere(notification.targetUserId),
        select: { id: true },
      });
      if (user) recipients = [{ userId: user.id, isCaptain: false }];
    }
    const preferences = await tx.notificationPreference.findMany({
      where: { userId: { in: recipients.map(({ userId }) => userId) }, type: notification.type },
    });
    const children: NotificationEntry[] = [];
    for (const { userId, isCaptain } of recipients) {
      const stored = preferences.find((preference) => preference.userId === userId);
      const channels = effectiveChannels(notification.type, isCaptain, stored);
      for (const [on, channel] of [
        [channels.discord, NotifChannel.USER_DM],
        [channels.email, NotifChannel.USER_EMAIL],
      ] as const) {
        if (!on) continue;
        // type and payload were parsed together, so they match.
        children.push({
          type: notification.type,
          payload,
          channel,
          entityId: notification.id,
          targetUserId: userId,
          targetTeamId: notification.targetTeamId ?? undefined,
          scrimId: notification.scrimId ?? undefined,
          requestId: notification.requestId ?? undefined,
          scheduledFor: now,
        } as NotificationEntry);
      }
    }
    const settled = await settle(
      tx,
      notification.id,
      children.length > 0
        ? { status: NotifStatus.SENT, sentAt: now }
        : { status: NotifStatus.CANCELLED, scheduledFor: now },
    );
    if (!settled) return null;
    await queueNotifications(tx, now, children);
    return children.length > 0 ? "DISTRIBUTED" : "CANCELLED";
  });
}

/**
 * A fanned-out copy is dropped when its person left the team or has switched the channel off since
 * (§5.17). The defaults are not worked out again: the fan-out already decided with them, and a
 * captain change in between must not drop the copy of the former captain.
 */
async function stillWanted(notification: LoadedNotification): Promise<boolean> {
  const userId = notification.targetUserId;
  if (!userId) return true;
  if (notification.targetTeamId) {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: notification.targetTeamId, userId } },
      select: { userId: true },
    });
    if (!membership) return false;
  }
  const stored = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type: notification.type } },
  });
  const choice = notification.channel === NotifChannel.USER_EMAIL ? stored?.email : stored?.discord;
  return choice !== false;
}

/**
 * A USER_DM to a person queued before Phase 18 (a verification result) is fanned out like a
 * personal one, so a choice of mail only applies to it too. A fanned-out copy names its parent as
 * the entity of its dedupeKey; an entry from before names something else.
 */
async function isEntryFromBeforePhase18(notification: LoadedNotification): Promise<boolean> {
  if (notification.channel !== NotifChannel.USER_DM || notification.targetTeamId) return false;
  const entityId = notification.dedupeKey.split(":")[1] ?? "";
  const parent = await prisma.notification.findUnique({
    where: { id: entityId },
    select: { id: true },
  });
  return parent === null;
}

/**
 * Sends one due PENDING notification (§6.2): relevance check, recipient, deliver, result.
 * Returns null if it is not due or no longer pending, also when it was cancelled during the send.
 */
export async function deliverNotification(
  id: string,
  now: Date,
  deliver: Deliver,
  env: DevEnv = process.env,
): Promise<DeliveryOutcome | null> {
  const notification = await loadNotification(id);
  if (!notification || notification.status !== NotifStatus.PENDING) return null;
  if (notification.scheduledFor > now) return null;
  // scheduledFor keeps when the entry was dropped; the purge counts from there (§6.3).
  const cancel = async () =>
    (await settle(prisma, id, { status: NotifStatus.CANCELLED, scheduledFor: now }))
      ? ("CANCELLED" as const)
      : null;
  if (!isNotificationRelevant(notification, now)) return cancel();
  const payload = parseNotificationPayload(notification.type, notification.payload);
  if (!payload) {
    const failed = await settle(prisma, id, {
      status: NotifStatus.FAILED,
      lastError: "Invalid payload",
      scheduledFor: now,
    });
    return failed ? "FAILED" : null;
  }
  if (
    PERSONAL_CHANNELS.includes(notification.channel) ||
    (await isEntryFromBeforePhase18(notification))
  ) {
    return fanOut(notification, payload, now);
  }
  if (!(await stillWanted(notification))) return cancel();
  const recipient = await resolveRecipient(notification, env);
  if (!recipient) return cancel();

  // type and payload were parsed together, so they match.
  const message = {
    id,
    type: notification.type,
    payload,
    recipient,
    requestId: notification.requestId,
    scrimId: notification.scrimId,
    opponentCaptain: await opponentCaptain(notification),
    feedbackDeadline: notification.scrim?.feedbackDeadline ?? null,
    locale: messageLocale(notification),
  } as OutboxMessage;
  const result = await deliver(message);
  if (!result.ok) return recordFailure(notification, recipient, result, now);
  await recordDmResult(recipient, null);
  return (await settle(prisma, id, { status: NotifStatus.SENT, sentAt: now })) ? "SENT" : null;
}

/** One sender run: due PENDING entries, oldest first, one after another (§6.2). */
export async function deliverDueNotifications(
  now: Date,
  deliver: Deliver,
  options: { limit?: number; env?: DevEnv } = {},
): Promise<Record<DeliveryOutcome, number>> {
  const due = await prisma.notification.findMany({
    where: { status: NotifStatus.PENDING, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: options.limit ?? 20,
    select: { id: true },
  });
  const counts: Record<DeliveryOutcome, number> = {
    SENT: 0,
    DISTRIBUTED: 0,
    CANCELLED: 0,
    FAILED: 0,
    RETRY: 0,
  };
  for (const { id } of due) {
    try {
      const outcome = await deliverNotification(id, now, deliver, options.env);
      if (outcome) counts[outcome]++;
    } catch (error) {
      // One broken entry must not block the others; it stays PENDING for the next run.
      console.error(`Could not deliver notification ${id}`, error);
    }
  }
  return counts;
}

/** The admin list shows at most this many failed entries, the latest failures first. */
export const MAX_FAILED_SHOWN = 100;

/**
 * Admin: notifications that failed for good (SPEC P0-9), read only. The latest MAX_FAILED_SHOWN
 * entries and how many there are in all, so the page can say that older ones are not shown.
 */
export async function listFailedNotifications(adminId: string) {
  await requireAdmin(adminId);
  const total = await prisma.notification.count({ where: { status: NotifStatus.FAILED } });
  const rows = await prisma.notification.findMany({
    where: { status: NotifStatus.FAILED },
    // For failed entries scheduledFor is the time of the last attempt (recordFailure).
    orderBy: [{ scheduledFor: "desc" }, { id: "asc" }],
    take: MAX_FAILED_SHOWN,
    select: {
      id: true,
      type: true,
      channel: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      scheduledFor: true,
      targetUser: { select: { name: true } },
      targetTeam: { select: { name: true } },
    },
  });
  // A fanned-out copy has both: the person and, in brackets, the team (§5.17).
  const entries = rows.map(({ targetUser, targetTeam, ...row }) => ({
    ...row,
    targetName:
      targetUser && targetTeam
        ? `${targetUser.name} (${targetTeam.name})`
        : (targetUser?.name ?? targetTeam?.name ?? null),
  }));
  return { entries, total };
}
