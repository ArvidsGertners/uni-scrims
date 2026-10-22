import {
  FeedbackOutcome,
  NotifChannel,
  NotifStatus,
  NotifType,
  type Prisma,
  prisma,
} from "@uni-scrims/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Deliver,
  type DeliveryResult,
  MAX_RETRIES,
  type OutboxMessage,
  applyToRequest,
  cancelScrim,
  classifyDeliveryError,
  deleteRequest,
  deliverDueNotifications,
  deliverNotification,
  expireRequests,
  openFeedback,
  retryDelayMs,
  submitFeedback,
} from "../src/index.ts";
import { queueNotifications } from "../src/notifications.ts";
import {
  NOW,
  REQUEST_STARTS_AT,
  bookScrim,
  createOpenRequest,
  createReadyTeam,
  createUser,
  uid,
} from "./helpers.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const AFTER_START = new Date(REQUEST_STARTS_AT.getTime() + HOUR);
const FEEDBACK_OPENS = new Date(REQUEST_STARTS_AT.getTime() + 3 * HOUR);
const NO_DEV_ENV = { NODE_ENV: "production" };
const DEV_ENV = {
  NODE_ENV: "development",
  DEV_DM_REDIRECT_DISCORD_ID: "900000000000000001",
  DEV_CHANNEL_ID: "900000000000000002",
};

/** Records every message and answers with `result`. */
function recorder(result: DeliveryResult = { ok: true }) {
  const sent: OutboxMessage[] = [];
  const deliver: Deliver = async (message) => {
    sent.push(message);
    return result;
  };
  return { sent, deliver };
}

async function send(
  id: string,
  now: Date = NOW,
  deliver: Deliver = recorder().deliver,
  env: Record<string, string> = NO_DEV_ENV,
) {
  return deliverNotification(id, now, deliver, env);
}

async function find(where: Prisma.NotificationWhereInput) {
  return prisma.notification.findFirstOrThrow({ where });
}

async function status(id: string) {
  return (await prisma.notification.findUniqueOrThrow({ where: { id } })).status;
}

async function scrimNotification(
  scrimId: string,
  type: NotifType,
  teamId: string,
  channel: NotifChannel = NotifChannel.CAPTAIN_DM,
) {
  return find({ scrimId, type, targetTeamId: teamId, channel });
}

/** A notification without relevance check, for the error handling. */
async function queueVerificationResult(userId: string) {
  const entityId = uid();
  await queueNotifications(prisma, NOW, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.USER_DM,
      entityId,
      targetUserId: userId,
      payload: { approved: true, rejectReason: null },
    },
  ]);
  return find({ dedupeKey: { startsWith: `${NotifType.VERIFICATION_RESULT}:${entityId}:` } });
}

describe("classifyDeliveryError and retryDelayMs (§6.2)", () => {
  it("treats 50007 on a DM and channel errors on a team channel as final", () => {
    expect(classifyDeliveryError(NotifChannel.USER_DM, 50007)).toBe("DM_BLOCKED");
    expect(classifyDeliveryError(NotifChannel.CAPTAIN_DM, 50007)).toBe("DM_BLOCKED");
    for (const code of [10003, 50001, 50013]) {
      expect(classifyDeliveryError(NotifChannel.TEAM_CHANNEL, code)).toBe("CHANNEL_BROKEN");
      expect(classifyDeliveryError(NotifChannel.CAPTAIN_DM, code)).toBe("RETRY");
    }
    expect(classifyDeliveryError(NotifChannel.TEAM_CHANNEL, 50007)).toBe("RETRY");
    expect(classifyDeliveryError(NotifChannel.USER_DM, null)).toBe("RETRY");
    expect(classifyDeliveryError(NotifChannel.TEAM_CHANNEL, null)).toBe("RETRY");
  });

  it("waits 1, 2, 4, 8 and 16 minutes", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([1, 2, 4, 8, 16].map((m) => m * MINUTE));
  });
});

describe("deliverNotification: recipients", () => {
  it("sends a booking to the captain with the opponent's captain", async () => {
    const { host, guest, scrim } = await bookScrim();
    const notification = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    const { sent, deliver } = recorder();
    expect(await send(notification.id, NOW, deliver)).toBe("SENT");
    expect(sent).toEqual([
      {
        id: notification.id,
        type: NotifType.SCRIM_BOOKED,
        payload: {
          opponentTeamName: guest.team.name,
          startsAt: REQUEST_STARTS_AT.toISOString(),
          format: scrim.format,
        },
        recipient: {
          kind: "DM",
          userId: host.captain.id,
          discordId: host.captain.discordId,
          redirectedFrom: null,
        },
        requestId: null,
        scrimId: scrim.id,
        opponentCaptain: { name: guest.captain.name, discordId: guest.captain.discordId },
        feedbackDeadline: scrim.feedbackDeadline,
      },
    ]);
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      status: NotifStatus.SENT,
      sentAt: NOW,
      attempts: 0,
    });
  });

  it("resolves both captains at send time, after a transfer of the role", async () => {
    const { host, guest, scrim } = await bookScrim();
    const newCaptain = host.members[0]!;
    await prisma.team.update({ where: { id: host.team.id }, data: { captainId: newCaptain.id } });
    const { sent, deliver } = recorder();
    await send(
      (await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id)).id,
      NOW,
      deliver,
    );
    await send(
      (await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, guest.team.id)).id,
      NOW,
      deliver,
    );
    expect(sent[0]?.recipient).toMatchObject({
      userId: newCaptain.id,
      discordId: newCaptain.discordId,
    });
    expect(sent[1]?.opponentCaptain).toEqual({
      name: newCaptain.name,
      discordId: newCaptain.discordId,
    });
  });

  it("posts to the linked team channel and drops posts of teams without one", async () => {
    const { host, guest, scrim } = await bookScrim();
    await prisma.team.update({ where: { id: host.team.id }, data: { discordChannelId: "111" } });
    const hostPost = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const guestPost = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      guest.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const { sent, deliver } = recorder();
    expect(await send(hostPost.id, NOW, deliver)).toBe("SENT");
    expect(await send(guestPost.id, NOW, deliver)).toBe("CANCELLED");
    expect(sent.map((message) => message.recipient)).toEqual([
      { kind: "CHANNEL", channelId: "111", redirectedFrom: null },
    ]);
    expect(await status(guestPost.id)).toBe(NotifStatus.CANCELLED);
  });

  it("sends a verification result to the user", async () => {
    const user = await createUser();
    const notification = await queueVerificationResult(user.id);
    const { sent, deliver } = recorder();
    expect(await send(notification.id, NOW, deliver)).toBe("SENT");
    expect(sent[0]).toMatchObject({
      type: NotifType.VERIFICATION_RESULT,
      payload: { approved: true, rejectReason: null },
      recipient: { kind: "DM", userId: user.id, discordId: user.discordId },
      opponentCaptain: null,
    });
  });

  it("drops a DM to a user without a Discord account", async () => {
    const user = await createUser();
    await prisma.account.deleteMany({ where: { userId: user.id } });
    const notification = await queueVerificationResult(user.id);
    expect(await send(notification.id)).toBe("CANCELLED");
  });

  it("redirects every DM and team post in development", async () => {
    const { host, scrim } = await bookScrim();
    const dm = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    const post = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const { sent, deliver } = recorder();
    await send(dm.id, NOW, deliver, DEV_ENV);
    await send(post.id, NOW, deliver, DEV_ENV);
    expect(sent.map((message) => message.recipient)).toEqual([
      {
        kind: "DM",
        userId: host.captain.id,
        discordId: DEV_ENV.DEV_DM_REDIRECT_DISCORD_ID,
        redirectedFrom: host.captain.name,
      },
      { kind: "CHANNEL", channelId: DEV_ENV.DEV_CHANNEL_ID, redirectedFrom: host.team.name },
    ]);
  });

  it("ignores the dev redirects outside development", async () => {
    const { host, scrim } = await bookScrim();
    const post = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    expect(
      await send(post.id, NOW, recorder().deliver, { ...DEV_ENV, NODE_ENV: "production" }),
    ).toBe("CANCELLED");
  });
});

describe("deliverNotification: relevance (§6.1)", () => {
  it("sends APPLICATION_RECEIVED only while the request is open", async () => {
    const host = await createReadyTeam();
    const first = await createReadyTeam();
    const second = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    for (const team of [first, second]) {
      await applyToRequest({ userId: team.captain.id, requestId: request.id, now: NOW });
    }
    const received = await prisma.notification.findMany({
      where: { requestId: request.id, type: NotifType.APPLICATION_RECEIVED },
      orderBy: { id: "asc" },
    });
    expect(await send(received[0]!.id)).toBe("SENT");
    await deleteRequest({ userId: host.captain.id, requestId: request.id, now: NOW });
    expect(await send(received[1]!.id)).toBe("CANCELLED");
  });

  it("sends booking and reminders only while the scrim is scheduled and both teams are active", async () => {
    const { host, guest, scrim } = await bookScrim();
    const reminderAt = new Date(REQUEST_STARTS_AT.getTime() - HOUR);
    const booked = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_1H, host.team.id);
    // Accepted in §6.1: a team banned during the confirmation; the messages are suppressed.
    await prisma.team.update({ where: { id: guest.team.id }, data: { bannedAt: NOW } });
    expect(await send(booked.id)).toBe("CANCELLED");
    expect(await send(reminder.id, reminderAt)).toBe("CANCELLED");
  });

  it("sends a reminder before the start and drops it after the start", async () => {
    const { host, scrim } = await bookScrim();
    const before1h = await scrimNotification(scrim.id, NotifType.REMINDER_1H, host.team.id);
    const before24h = await scrimNotification(scrim.id, NotifType.REMINDER_24H, host.team.id);
    expect(await send(before1h.id, before1h.scheduledFor)).toBe("SENT");
    expect(await send(before24h.id, REQUEST_STARTS_AT)).toBe("CANCELLED");
  });

  it("drops the booking once the scrim is no longer scheduled", async () => {
    const { host, scrim } = await bookScrim();
    const booked = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    await openFeedback(FEEDBACK_OPENS);
    expect(await send(booked.id, FEEDBACK_OPENS)).toBe("CANCELLED");
  });

  it("sends the feedback prompt only to teams that have not answered", async () => {
    const { host, guest, scrim } = await bookScrim();
    await submitFeedback({
      userId: host.captain.id,
      scrimId: scrim.id,
      outcome: FeedbackOutcome.PLAYED,
      rating: 4,
      now: AFTER_START,
    });
    const hostPrompt = await scrimNotification(scrim.id, NotifType.FEEDBACK_PROMPT, host.team.id);
    const guestPrompt = await scrimNotification(scrim.id, NotifType.FEEDBACK_PROMPT, guest.team.id);
    const { sent, deliver } = recorder();
    expect(await send(hostPrompt.id, FEEDBACK_OPENS, deliver)).toBe("CANCELLED");
    expect(await send(guestPrompt.id, FEEDBACK_OPENS, deliver)).toBe("SENT");
    expect(sent[0]?.feedbackDeadline).toEqual(scrim.feedbackDeadline);
  });

  it("drops the feedback prompt after the deadline, even before the sweeper evaluated", async () => {
    const { host, scrim } = await bookScrim();
    await openFeedback(FEEDBACK_OPENS);
    const prompt = await scrimNotification(scrim.id, NotifType.FEEDBACK_PROMPT, host.team.id);
    expect(await send(prompt.id, scrim.feedbackDeadline)).toBe("CANCELLED");
  });

  it("drops the feedback prompt once the scrim is evaluated", async () => {
    const { host, guest, scrim } = await bookScrim();
    for (const team of [host, guest]) {
      await submitFeedback({
        userId: team.captain.id,
        scrimId: scrim.id,
        outcome: FeedbackOutcome.WE_COULD_NOT,
        now: AFTER_START,
      });
    }
    const prompt = await scrimNotification(scrim.id, NotifType.FEEDBACK_PROMPT, host.team.id);
    expect(await send(prompt.id, FEEDBACK_OPENS)).toBe("CANCELLED");
  });

  it("drops every notification to a dissolved team", async () => {
    const host = await createReadyTeam();
    const applicant = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({ userId: applicant.captain.id, requestId: request.id, now: NOW });
    await expireRequests(REQUEST_STARTS_AT);
    const expired = await find({ requestId: request.id, type: NotifType.REQUEST_EXPIRED });
    await prisma.team.update({ where: { id: applicant.team.id }, data: { dissolvedAt: NOW } });
    expect(await send(expired.id, REQUEST_STARTS_AT)).toBe("CANCELLED");
  });

  it("sends types without a check regardless of the request state", async () => {
    const host = await createReadyTeam();
    const applicant = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({ userId: applicant.captain.id, requestId: request.id, now: NOW });
    await expireRequests(REQUEST_STARTS_AT);
    const expired = await find({ requestId: request.id, type: NotifType.REQUEST_EXPIRED });
    expect(await send(expired.id, REQUEST_STARTS_AT)).toBe("SENT");
  });

  it("skips entries that are not due or no longer pending", async () => {
    const { host, scrim } = await bookScrim();
    const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_1H, host.team.id);
    const { sent, deliver } = recorder();
    expect(await send(reminder.id, NOW, deliver)).toBeNull();
    expect(await send(reminder.id, reminder.scheduledFor, deliver)).toBe("SENT");
    expect(await send(reminder.id, reminder.scheduledFor, deliver)).toBeNull();
    expect(sent).toHaveLength(1);
  });

  it("catches up after a downtime: the prompt still goes out, stale messages are dropped", async () => {
    const { scrim } = await bookScrim();
    const later = new Date(FEEDBACK_OPENS.getTime() + HOUR);
    await openFeedback(later);
    const entries = await prisma.notification.findMany({
      where: { scrimId: scrim.id, channel: NotifChannel.CAPTAIN_DM },
    });
    for (const entry of entries) await send(entry.id, later);
    const byType = await prisma.notification.groupBy({
      by: ["type", "status"],
      where: { scrimId: scrim.id, channel: NotifChannel.CAPTAIN_DM },
      _count: { _all: true },
    });
    expect(byType.map((row) => `${row.type}:${row.status}:${row._count._all}`).sort()).toEqual(
      [
        "FEEDBACK_PROMPT:SENT:2",
        "REMINDER_1H:CANCELLED:2",
        "REMINDER_24H:CANCELLED:2",
        "SCRIM_BOOKED:CANCELLED:2",
      ].sort(),
    );
  });
});

describe("deliverNotification: results (§6.2)", () => {
  it("keeps an entry cancelled while it was being sent", async () => {
    for (const result of [{ ok: true }, { ok: false, code: null, error: "timeout" }] as const) {
      const { host, scrim } = await bookScrim();
      const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_24H, host.team.id);
      const cancelDuringSend: Deliver = async () => {
        await cancelScrim({
          userId: host.captain.id,
          scrimId: scrim.id,
          now: reminder.scheduledFor,
        });
        return result;
      };
      expect(await send(reminder.id, reminder.scheduledFor, cancelDuringSend)).toBeNull();
      expect(await prisma.notification.findUnique({ where: { id: reminder.id } })).toMatchObject({
        status: NotifStatus.CANCELLED,
        attempts: 0,
        sentAt: null,
      });
    }
  });

  it("marks a DM to a user who blocks DMs as failed and remembers it until a DM arrives", async () => {
    const user = await createUser();
    const blocked = await queueVerificationResult(user.id);
    const error = { ok: false, code: 50007, error: "Cannot send messages to this user" } as const;
    expect(await send(blocked.id, NOW, recorder(error).deliver)).toBe("FAILED");
    expect(await prisma.notification.findUnique({ where: { id: blocked.id } })).toMatchObject({
      status: NotifStatus.FAILED,
      attempts: 1,
      lastError: error.error,
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dmFailedAt).toEqual(
      NOW,
    );

    const next = await queueVerificationResult(user.id);
    expect(await send(next.id)).toBe("SENT");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dmFailedAt).toBeNull();
  });

  it("leaves dmFailedAt alone when the DM was redirected in development", async () => {
    const user = await createUser();
    const notification = await queueVerificationResult(user.id);
    const blocked = recorder({ ok: false, code: 50007, error: "Cannot send messages" });
    expect(await send(notification.id, NOW, blocked.deliver, DEV_ENV)).toBe("FAILED");
    expect(blocked.sent[0]?.recipient).toMatchObject({ redirectedFrom: user.name });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dmFailedAt).toBeNull();
  });

  it("unlinks a broken team channel and tells the captain once", async () => {
    const { host, scrim } = await bookScrim();
    await prisma.team.update({
      where: { id: host.team.id },
      data: { discordGuildId: "200", discordChannelId: "201" },
    });
    const booked = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const reminder = await scrimNotification(
      scrim.id,
      NotifType.REMINDER_24H,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const missingAccess = { ok: false, code: 50001, error: "Missing Access" } as const;
    expect(await send(booked.id, NOW, recorder(missingAccess).deliver)).toBe("FAILED");
    expect(await send(reminder.id, reminder.scheduledFor)).toBe("CANCELLED");

    expect(await prisma.team.findUniqueOrThrow({ where: { id: host.team.id } })).toMatchObject({
      discordChannelId: null,
    });
    const broken = await prisma.notification.findMany({
      where: { type: NotifType.CHANNEL_BROKEN, targetTeamId: host.team.id },
    });
    expect(broken).toEqual([
      expect.objectContaining({
        channel: NotifChannel.CAPTAIN_DM,
        dedupeKey: `CHANNEL_BROKEN:${booked.id}:${host.team.id}:CAPTAIN_DM`,
        payload: { teamName: host.team.name },
        status: NotifStatus.PENDING,
        scheduledFor: NOW,
      }),
    ]);
  });

  it("keeps a channel linked again by /setup while the old one failed", async () => {
    const { host, scrim } = await bookScrim();
    await prisma.team.update({ where: { id: host.team.id }, data: { discordChannelId: "301" } });
    const booked = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const relinkDuringSend: Deliver = async () => {
      await prisma.team.update({ where: { id: host.team.id }, data: { discordChannelId: "302" } });
      return { ok: false, code: 10003, error: "Unknown Channel" };
    };
    expect(await send(booked.id, NOW, relinkDuringSend)).toBe("FAILED");
    expect(await prisma.team.findUniqueOrThrow({ where: { id: host.team.id } })).toMatchObject({
      discordChannelId: "302",
    });
    expect(
      await prisma.notification.count({
        where: { type: NotifType.CHANNEL_BROKEN, targetTeamId: host.team.id },
      }),
    ).toBe(0);
  });

  it("keeps the team's own channel when the dev channel fails", async () => {
    const { host, scrim } = await bookScrim();
    await prisma.team.update({ where: { id: host.team.id }, data: { discordChannelId: "401" } });
    const booked = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const missingAccess = { ok: false, code: 50001, error: "Missing Access" } as const;
    expect(await send(booked.id, NOW, recorder(missingAccess).deliver, DEV_ENV)).toBe("FAILED");
    expect(await prisma.team.findUniqueOrThrow({ where: { id: host.team.id } })).toMatchObject({
      discordChannelId: "401",
    });
    expect(
      await prisma.notification.count({
        where: { type: NotifType.CHANNEL_BROKEN, targetTeamId: host.team.id },
      }),
    ).toBe(0);
  });

  it("retries other errors after 1, 2, 4, 8 and 16 minutes, then fails", async () => {
    const user = await createUser();
    const notification = await queueVerificationResult(user.id);
    const { sent, deliver } = recorder({ ok: false, code: null, error: "fetch failed" });
    let at = NOW;
    for (let failedSends = 1; failedSends <= MAX_RETRIES; failedSends++) {
      expect(await send(notification.id, at, deliver)).toBe("RETRY");
      const next = new Date(at.getTime() + retryDelayMs(failedSends));
      expect(
        await prisma.notification.findUnique({ where: { id: notification.id } }),
      ).toMatchObject({
        status: NotifStatus.PENDING,
        attempts: failedSends,
        lastError: "fetch failed",
        scheduledFor: next,
      });
      expect(await send(notification.id, new Date(next.getTime() - 1), deliver)).toBeNull();
      at = next;
    }
    expect(await send(notification.id, at, deliver)).toBe("FAILED");
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      status: NotifStatus.FAILED,
      attempts: MAX_RETRIES + 1,
    });
    expect(sent).toHaveLength(MAX_RETRIES + 1);
  });

  it("drops a reminder whose retry falls after the start", async () => {
    const { host, scrim } = await bookScrim();
    const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_1H, host.team.id);
    const failing = recorder({ ok: false, code: null, error: "timeout" }).deliver;
    expect(await send(reminder.id, reminder.scheduledFor, failing)).toBe("RETRY");
    expect(await send(reminder.id, REQUEST_STARTS_AT)).toBe("CANCELLED");
  });

  it("fails an entry whose payload does not match its type", async () => {
    const user = await createUser();
    const notification = await queueVerificationResult(user.id);
    await prisma.notification.update({ where: { id: notification.id }, data: { payload: {} } });
    const { sent, deliver } = recorder();
    expect(await send(notification.id, NOW, deliver)).toBe("FAILED");
    expect(sent).toEqual([]);
  });
});

describe("deliverDueNotifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The test database is shared: entries of other tests would otherwise be due as well.
  async function onlyNewEntries() {
    await prisma.notification.updateMany({
      where: { status: NotifStatus.PENDING },
      data: { status: NotifStatus.CANCELLED },
    });
  }

  it("sends due entries oldest first, at most `limit` per run", async () => {
    await onlyNewEntries();
    const user = await createUser();
    const first = await queueVerificationResult(user.id);
    const second = await queueVerificationResult(user.id);
    const later = await queueVerificationResult(user.id);
    await prisma.notification.update({
      where: { id: first.id },
      data: { scheduledFor: new Date(NOW.getTime() - MINUTE) },
    });
    await prisma.notification.update({
      where: { id: later.id },
      data: { scheduledFor: new Date(NOW.getTime() + MINUTE) },
    });
    const { sent, deliver } = recorder();
    expect(await deliverDueNotifications(NOW, deliver, { limit: 1, env: NO_DEV_ENV })).toEqual({
      SENT: 1,
      CANCELLED: 0,
      FAILED: 0,
      RETRY: 0,
    });
    await deliverDueNotifications(NOW, deliver, { env: NO_DEV_ENV });
    expect(sent.map((message) => message.id)).toEqual([first.id, second.id]);
    expect(await status(later.id)).toBe(NotifStatus.PENDING);
  });

  it("keeps going when one entry throws", async () => {
    await onlyNewEntries();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await createUser();
    const broken = await queueVerificationResult(user.id);
    const fine = await queueVerificationResult(user.id);
    const deliver: Deliver = async (message) => {
      if (message.id === broken.id) throw new Error("boom");
      return { ok: true };
    };
    expect(await deliverDueNotifications(NOW, deliver, { env: NO_DEV_ENV })).toMatchObject({
      SENT: 1,
    });
    expect(await status(broken.id)).toBe(NotifStatus.PENDING);
    expect(await status(fine.id)).toBe(NotifStatus.SENT);
  });
});
