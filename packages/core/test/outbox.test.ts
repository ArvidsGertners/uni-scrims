import {
  FeedbackOutcome,
  NotifChannel,
  NotifStatus,
  NotifType,
  type Prisma,
  prisma,
} from "@uni-scrims/db";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Deliver,
  type DeliveryOutcome,
  type DeliveryResult,
  MAX_FAILED_SHOWN,
  DELETED_USER_NAME,
  MAX_RETRIES,
  type OutboxMessage,
  applyToRequest,
  banUser,
  cancelScrim,
  classifyDeliveryError,
  deleteAccount,
  deleteRequest,
  deliverDueNotifications,
  deliverNotification,
  expireRequests,
  listFailedNotifications,
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
  createTeamWithMembers,
  createUser,
  uid,
  useAdmin,
} from "./helpers.ts";

const admin = useAdmin();

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

/**
 * Sends one entry; a personal one is fanned out first and its children are sent right away, as the
 * next sender run would (§5.17). Then the children's outcome, if they all had the same.
 */
async function send(
  id: string,
  now: Date = NOW,
  deliver: Deliver = recorder().deliver,
  env: Record<string, string> = NO_DEV_ENV,
) {
  const outcome = await deliverNotification(id, now, deliver, env);
  if (outcome !== "DISTRIBUTED") return outcome;
  const outcomes = new Set<DeliveryOutcome | null>();
  for (const child of await childrenOf(id)) {
    outcomes.add(await deliverNotification(child.id, now, deliver, env));
  }
  return outcomes.size === 1 ? [...outcomes][0]! : outcome;
}

/** The fanned-out copies of a personal notification (their dedupeKey names the parent). */
async function childrenOf(parentId: string) {
  return prisma.notification.findMany({
    where: { dedupeKey: { contains: `:${parentId}:` } },
    orderBy: [{ targetUserId: "asc" }, { channel: "asc" }],
  });
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
  channel: NotifChannel = NotifChannel.PERSONAL,
) {
  return find({ scrimId, type, targetTeamId: teamId, channel });
}

/**
 * A DM copy as the fan-out leaves it (§5.17), of a notification without relevance check, for the
 * error handling: its parent is the already distributed personal entry.
 */
async function queueVerificationResult(
  userId: string,
  channel: NotifChannel = NotifChannel.USER_DM,
) {
  const payload = { approved: true, rejectReason: null };
  const verificationId = uid();
  await queueNotifications(prisma, NOW, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.PERSONAL,
      entityId: verificationId,
      targetUserId: userId,
      payload,
    },
  ]);
  const parent = await find({
    dedupeKey: { startsWith: `${NotifType.VERIFICATION_RESULT}:${verificationId}:` },
  });
  await prisma.notification.update({
    where: { id: parent.id },
    data: { status: NotifStatus.SENT, sentAt: NOW },
  });
  await queueNotifications(prisma, NOW, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel,
      entityId: parent.id,
      targetUserId: userId,
      payload,
    },
  ]);
  return find({ dedupeKey: { startsWith: `${NotifType.VERIFICATION_RESULT}:${parent.id}:` } });
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
    const [copy] = await childrenOf(notification.id);
    expect(sent).toEqual([
      {
        id: copy!.id,
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

  it("shows a deleted captain of a banned team without a Discord mention", async () => {
    // Banned after the start (the scrim stays), then the captain deletes the account: the ban
    // moves to a placeholder, so the opponent's feedback prompt has no Discord ID to mention.
    const { host, guest, scrim } = await bookScrim();
    await banUser({
      adminId: admin.id,
      userId: guest.captain.id,
      uploadDir: tmpdir(),
      now: AFTER_START,
    });
    await deleteAccount({ userId: guest.captain.id, uploadDir: tmpdir(), now: AFTER_START });
    const prompt = await scrimNotification(scrim.id, NotifType.FEEDBACK_PROMPT, host.team.id);
    const { sent, deliver } = recorder();
    expect(await send(prompt.id, FEEDBACK_OPENS, deliver)).toBe("SENT");
    expect(sent[0]?.opponentCaptain).toEqual({ name: DELETED_USER_NAME, discordId: null });
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

/** A mail copy as the fan-out leaves it (§5.17). */
async function queueMail(userId: string) {
  return queueVerificationResult(userId, NotifChannel.USER_EMAIL);
}

/** A user with a real, confirmed address (the test users have placeholders). */
async function userWithMail() {
  const user = await createUser();
  const email = `ana.${uid()}@example.org`;
  await prisma.user.update({ where: { id: user.id }, data: { email } });
  return { ...user, email };
}

describe("deliverNotification: mails (§5.17)", () => {
  it("sends a mail to the confirmed address", async () => {
    const user = await userWithMail();
    const notification = await queueMail(user.id);
    const { sent, deliver } = recorder();
    expect(await send(notification.id, NOW, deliver)).toBe("SENT");
    expect(sent[0]).toMatchObject({
      type: NotifType.VERIFICATION_RESULT,
      recipient: { kind: "EMAIL", userId: user.id, email: user.email },
    });
  });

  it("drops a mail without a deliverable address", async () => {
    const placeholder = await createUser();
    expect(await send((await queueMail(placeholder.id)).id)).toBe("CANCELLED");
    const unconfirmed = await userWithMail();
    await prisma.user.update({ where: { id: unconfirmed.id }, data: { emailVerified: false } });
    expect(await send((await queueMail(unconfirmed.id)).id)).toBe("CANCELLED");
  });

  it("retries every mail error and never marks DMs as failed", async () => {
    expect(classifyDeliveryError(NotifChannel.USER_EMAIL, 50007)).toBe("RETRY");
    const user = await userWithMail();
    const notification = await queueMail(user.id);
    const { deliver } = recorder({ ok: false, code: null, error: "Greeting never received" });
    expect(await send(notification.id, NOW, deliver)).toBe("RETRY");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).dmFailedAt).toBeNull();
  });
});

/** Whom a DM or mail went to. */
function recipientUser(message: OutboxMessage): string | null {
  return "userId" in message.recipient ? message.recipient.userId : null;
}

/** A stored setting (§5.17); null keeps the default for that channel. */
async function choose(
  userId: string,
  type: NotifType,
  channels: { discord?: boolean | null; email?: boolean | null },
) {
  await prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, discord: channels.discord ?? null, email: channels.email ?? null },
    update: { discord: channels.discord ?? null, email: channels.email ?? null },
  });
}

describe("deliverNotification: personal notifications (§5.17)", () => {
  it("goes to the captain only by default, like before Phase 18", async () => {
    const { host, scrim } = await bookScrim();
    const booked = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    const { sent, deliver } = recorder();
    expect(await deliverNotification(booked.id, NOW, deliver, NO_DEV_ENV)).toBe("DISTRIBUTED");
    expect(await status(booked.id)).toBe(NotifStatus.SENT);
    const children = await childrenOf(booked.id);
    expect(children).toEqual([
      expect.objectContaining({
        channel: NotifChannel.USER_DM,
        targetUserId: host.captain.id,
        targetTeamId: host.team.id,
        scrimId: scrim.id,
        dedupeKey: `SCRIM_BOOKED:${booked.id}:${host.captain.id}:USER_DM`,
        status: NotifStatus.PENDING,
        scheduledFor: NOW,
      }),
    ]);
    expect(sent).toEqual([]);
  });

  it("brings scrim notifications to members who switched them on, from the team's view", async () => {
    const { host, guest, scrim } = await bookScrim();
    const [discordMember, mailMember] = host.members;
    await choose(discordMember!.id, NotifType.REMINDER_24H, { discord: true });
    await prisma.user.update({
      where: { id: mailMember!.id },
      data: { email: `mila.${uid()}@example.org` },
    });
    await choose(mailMember!.id, NotifType.REMINDER_24H, { email: true });
    const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_24H, host.team.id);
    const { sent, deliver } = recorder();
    expect(await send(reminder.id, reminder.scheduledFor, deliver)).toBe("SENT");
    expect(sent.map((message) => [message.recipient.kind, recipientUser(message)]).sort()).toEqual(
      [
        ["DM", host.captain.id],
        ["DM", discordMember!.id],
        ["EMAIL", mailMember!.id],
      ].sort(),
    );
    for (const message of sent) {
      expect(message.opponentCaptain).toEqual({
        name: guest.captain.name,
        discordId: guest.captain.discordId,
      });
    }
  });

  it("keeps captain notifications with the captain, whatever members switched on", async () => {
    const host = await createReadyTeam();
    const guest = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await choose(host.members[0]!.id, NotifType.APPLICATION_RECEIVED, { discord: true });
    await applyToRequest({
      userId: guest.captain.id,
      teamId: guest.team.id,
      requestId: request.id,
      now: NOW,
    });
    const received = await find({
      type: NotifType.APPLICATION_RECEIVED,
      targetTeamId: host.team.id,
      channel: NotifChannel.PERSONAL,
    });
    const { sent, deliver } = recorder();
    expect(await send(received.id, NOW, deliver)).toBe("SENT");
    expect(sent.map(recipientUser)).toEqual([host.captain.id]);
  });

  it("is dropped when nobody wants it", async () => {
    const { host, scrim } = await bookScrim();
    await choose(host.captain.id, NotifType.SCRIM_BOOKED, { discord: false });
    const booked = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    expect(await deliverNotification(booked.id, NOW, recorder().deliver, NO_DEV_ENV)).toBe(
      "CANCELLED",
    );
    expect(await childrenOf(booked.id)).toEqual([]);
    expect(await prisma.notification.findUnique({ where: { id: booked.id } })).toMatchObject({
      status: NotifStatus.CANCELLED,
      scheduledFor: NOW,
    });
  });

  it("drops a copy whose person left the team or switched it off after the fan-out", async () => {
    const { host, scrim } = await bookScrim();
    const [leaving, switching] = host.members;
    for (const member of [leaving!, switching!]) {
      await choose(member.id, NotifType.SCRIM_BOOKED, { discord: true });
    }
    const booked = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    await deliverNotification(booked.id, NOW, recorder().deliver, NO_DEV_ENV);
    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: host.team.id, userId: leaving!.id } },
    });
    await choose(switching!.id, NotifType.SCRIM_BOOKED, { discord: false });
    const { sent, deliver } = recorder();
    for (const child of await childrenOf(booked.id)) {
      await deliverNotification(child.id, NOW, deliver, NO_DEV_ENV);
    }
    expect(sent.map(recipientUser)).toEqual([host.captain.id]);
  });

  it("still sends the former captain's copy after a captain change", async () => {
    const { host, scrim } = await bookScrim();
    const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_1H, host.team.id);
    const failing = recorder({ ok: false, code: null, error: "timeout" }).deliver;
    expect(await send(reminder.id, reminder.scheduledFor, failing)).toBe("RETRY");
    await prisma.team.update({
      where: { id: host.team.id },
      data: { captainId: host.members[0]!.id },
    });
    const [copy] = await childrenOf(reminder.id);
    const { sent, deliver } = recorder();
    const retryAt = new Date(reminder.scheduledFor.getTime() + MINUTE);
    expect(await send(copy!.id, retryAt, deliver)).toBe("SENT");
    expect(sent.map(recipientUser)).toEqual([host.captain.id]);
  });

  it("fans out a verification DM from before Phase 18, so mail only applies", async () => {
    const user = await userWithMail();
    await choose(user.id, NotifType.VERIFICATION_RESULT, { discord: false, email: true });
    await queueNotifications(prisma, NOW, [
      {
        type: NotifType.VERIFICATION_RESULT,
        channel: NotifChannel.USER_DM,
        entityId: uid(),
        targetUserId: user.id,
        payload: { approved: true, rejectReason: null },
      },
    ]);
    const legacy = await find({ targetUserId: user.id, channel: NotifChannel.USER_DM });
    const { sent, deliver } = recorder();
    expect(await send(legacy.id, NOW, deliver)).toBe("SENT");
    expect(sent.map((message) => message.recipient.kind)).toEqual(["EMAIL"]);
  });

  it("fans out entries from before Phase 18 like personal ones", async () => {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 1 });
    await choose(members[0]!.id, NotifType.CHANNEL_BROKEN, { discord: true });
    await queueNotifications(prisma, NOW, [
      {
        type: NotifType.CHANNEL_BROKEN,
        channel: NotifChannel.CAPTAIN_DM,
        entityId: uid(),
        targetTeamId: team.id,
        payload: { teamName: team.name },
      },
    ]);
    const legacy = await find({ targetTeamId: team.id, channel: NotifChannel.CAPTAIN_DM });
    const { sent, deliver } = recorder();
    expect(await send(legacy.id, NOW, deliver)).toBe("SENT");
    expect(sent.map(recipientUser)).toEqual([captain.id]);
  });

  it("sends a verification result by DM and mail as chosen", async () => {
    const user = await userWithMail();
    await choose(user.id, NotifType.VERIFICATION_RESULT, { email: true });
    await queueNotifications(prisma, NOW, [
      {
        type: NotifType.VERIFICATION_RESULT,
        channel: NotifChannel.PERSONAL,
        entityId: uid(),
        targetUserId: user.id,
        payload: { approved: true, rejectReason: null },
      },
    ]);
    const result = await find({ targetUserId: user.id, channel: NotifChannel.PERSONAL });
    const { sent, deliver } = recorder();
    expect(await send(result.id, NOW, deliver)).toBe("SENT");
    expect(sent.map((message) => message.recipient.kind).sort()).toEqual(["DM", "EMAIL"]);
  });

  it("marks only the member whose DM is blocked", async () => {
    const { host, scrim } = await bookScrim();
    const member = host.members[0]!;
    await choose(member.id, NotifType.SCRIM_BOOKED, { discord: true });
    const booked = await scrimNotification(scrim.id, NotifType.SCRIM_BOOKED, host.team.id);
    const deliver: Deliver = async (message) =>
      recipientUser(message) === member.id
        ? { ok: false, code: 50007, error: "Cannot send messages to this user" }
        : { ok: true };
    await send(booked.id, NOW, deliver);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).dmFailedAt).toEqual(
      NOW,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: host.captain.id } })).dmFailedAt,
    ).toBeNull();
  });
});

describe("deliverNotification: relevance (§6.1)", () => {
  it("sends APPLICATION_RECEIVED only while the request is open", async () => {
    const host = await createReadyTeam();
    const first = await createReadyTeam();
    const second = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    for (const team of [first, second]) {
      await applyToRequest({
        userId: team.captain.id,
        teamId: team.team.id,
        requestId: request.id,
        now: NOW,
      });
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
    // A second line of defence (§6.1): e.g. a team banned by hand in the database.
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
      teamId: host.team.id,
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
        teamId: team.team.id,
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
    await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
      requestId: request.id,
      now: NOW,
    });
    await expireRequests(REQUEST_STARTS_AT);
    const expired = await find({ requestId: request.id, type: NotifType.REQUEST_EXPIRED });
    await prisma.team.update({ where: { id: applicant.team.id }, data: { dissolvedAt: NOW } });
    expect(await send(expired.id, REQUEST_STARTS_AT)).toBe("CANCELLED");
  });

  it("sends types without a check regardless of the request state", async () => {
    const host = await createReadyTeam();
    const applicant = await createReadyTeam();
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({
      userId: applicant.captain.id,
      teamId: applicant.team.id,
      requestId: request.id,
      now: NOW,
    });
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
      where: { scrimId: scrim.id, channel: NotifChannel.PERSONAL },
    });
    for (const entry of entries) await send(entry.id, later);
    const byType = await prisma.notification.groupBy({
      by: ["type", "status"],
      where: { scrimId: scrim.id, channel: NotifChannel.PERSONAL },
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
          teamId: host.team.id,
          scrimId: scrim.id,
          now: reminder.scheduledFor,
        });
        return result;
      };
      expect(await send(reminder.id, reminder.scheduledFor, cancelDuringSend)).toBeNull();
      // The cancellation also takes the captain's copy, which was being sent.
      const [copy] = await childrenOf(reminder.id);
      expect(copy).toMatchObject({ status: NotifStatus.CANCELLED, attempts: 0, sentAt: null });
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

  it("does not mark a DM as failed for an account deleted during the send", async () => {
    const user = await createUser();
    const notification = await queueVerificationResult(user.id);
    const deliver: Deliver = async () => {
      await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
      return { ok: false, code: 50007, error: "Cannot send messages to this user" };
    };
    // The deletion removed the entry, so nothing is written.
    expect(await send(notification.id, NOW, deliver)).toBeNull();
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      dmFailedAt: null,
    });
  });

  it("does not mark a captain DM as failed when the captain deleted the account during the send", async () => {
    // An entry from before Phase 18, fanned out to the captain; the deletion (which dissolves the
    // captain's team) removes the captain's copy, so nothing is settled and nothing marked.
    const { team, captain } = await createTeamWithMembers();
    await queueNotifications(prisma, NOW, [
      {
        type: NotifType.REQUEST_EXPIRED,
        channel: NotifChannel.CAPTAIN_DM,
        entityId: uid(),
        targetTeamId: team.id,
        payload: { teamName: "Andere", startsAt: REQUEST_STARTS_AT.toISOString() },
      },
    ]);
    const notification = await find({ targetTeamId: team.id, type: NotifType.REQUEST_EXPIRED });
    const deliver: Deliver = async () => {
      await deleteAccount({ userId: captain.id, uploadDir: tmpdir(), now: NOW });
      return { ok: false, code: 50007, error: "Cannot send messages to this user" };
    };
    expect(await send(notification.id, NOW, deliver)).toBeNull();
    expect(await childrenOf(notification.id)).toEqual([]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: captain.id } })).toMatchObject({
      dmFailedAt: null,
    });
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
        channel: NotifChannel.PERSONAL,
        dedupeKey: `CHANNEL_BROKEN:${booked.id}:${host.team.id}:PERSONAL`,
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
    // The last attempt comes late (bot was down); scheduledFor keeps when it happened.
    const lastAttempt = new Date(at.getTime() + HOUR);
    expect(await send(notification.id, lastAttempt, deliver)).toBe("FAILED");
    expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toMatchObject({
      status: NotifStatus.FAILED,
      attempts: MAX_RETRIES + 1,
      scheduledFor: lastAttempt,
    });
    expect(sent).toHaveLength(MAX_RETRIES + 1);
  });

  it("drops a reminder whose retry falls after the start", async () => {
    const { host, scrim } = await bookScrim();
    const reminder = await scrimNotification(scrim.id, NotifType.REMINDER_1H, host.team.id);
    const failing = recorder({ ok: false, code: null, error: "timeout" }).deliver;
    expect(await send(reminder.id, reminder.scheduledFor, failing)).toBe("RETRY");
    const [copy] = await childrenOf(reminder.id);
    expect(await send(copy!.id, REQUEST_STARTS_AT)).toBe("CANCELLED");
  });

  it("keeps the time of the result in scheduledFor for every FAILED and CANCELLED entry (§6.2)", async () => {
    // All entries are due at NOW, the bot handles them an hour late (e.g. after an outage).
    const late = new Date(NOW.getTime() + HOUR);
    const settledAt = async (id: string) =>
      (await prisma.notification.findUniqueOrThrow({ where: { id } })).scheduledFor;

    const user = await createUser();
    const invalid = await queueVerificationResult(user.id);
    await prisma.notification.update({ where: { id: invalid.id }, data: { payload: {} } });
    expect(await send(invalid.id, late)).toBe("FAILED");
    const blocked = await queueVerificationResult(user.id);
    const dmBlocked = recorder({ ok: false, code: 50007, error: "Cannot send" }).deliver;
    expect(await send(blocked.id, late, dmBlocked)).toBe("FAILED");

    const { host, guest, scrim, request } = await bookScrim();
    await prisma.team.update({ where: { id: host.team.id }, data: { discordChannelId: "401" } });
    const post = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      host.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    const channelBroken = recorder({ ok: false, code: 10003, error: "Unknown Channel" }).deliver;
    expect(await send(post.id, late, channelBroken)).toBe("FAILED");
    // No channel linked: dropped when the recipient is resolved.
    const noChannel = await scrimNotification(
      scrim.id,
      NotifType.SCRIM_BOOKED,
      guest.team.id,
      NotifChannel.TEAM_CHANNEL,
    );
    expect(await send(noChannel.id, late)).toBe("CANCELLED");
    // No longer relevant: the application arrived for a request that is booked now.
    const received = await find({ requestId: request.id, type: NotifType.APPLICATION_RECEIVED });
    expect(await send(received.id, late)).toBe("CANCELLED");

    for (const { id } of [invalid, blocked, post, noChannel, received]) {
      expect(await settledAt(id)).toEqual(late);
    }
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
      DISTRIBUTED: 0,
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

describe("listFailedNotifications", () => {
  // Later than every entry the other tests create, so these come first.
  const LATER = new Date(NOW.getTime() + 1000 * 24 * HOUR);

  async function failed(
    data: Pick<
      Prisma.NotificationUncheckedCreateInput,
      "channel" | "targetUserId" | "targetTeamId"
    >,
    createdAt: Date,
    status: NotifStatus = NotifStatus.FAILED,
    failedAt: Date = createdAt,
  ) {
    return prisma.notification.create({
      data: {
        ...data,
        type: NotifType.SCRIM_BOOKED,
        payload: {},
        scheduledFor: failedAt,
        status,
        attempts: 6,
        lastError: "Discord says no",
        dedupeKey: uid(),
        createdAt,
      },
    });
  }

  it("is only for admins", async () => {
    const user = await createUser();
    await expect(listFailedNotifications(user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists failed entries by their last attempt, latest first, with the name of the target", async () => {
    const user = await createUser();
    const { team } = await createReadyTeam();
    const toUser = await failed(
      { channel: NotifChannel.USER_DM, targetUserId: user.id },
      LATER,
      NotifStatus.FAILED,
      new Date(LATER.getTime() + 2 * HOUR),
    );
    // Created later, but failed earlier: comes second.
    const toTeam = await failed(
      { channel: NotifChannel.TEAM_CHANNEL, targetTeamId: team.id },
      new Date(LATER.getTime() + HOUR),
    );
    const sent = await failed(
      { channel: NotifChannel.USER_DM, targetUserId: user.id },
      new Date(LATER.getTime() + HOUR),
      NotifStatus.SENT,
    );

    const { entries: list } = await listFailedNotifications(admin.id);
    expect(list.slice(0, 2)).toEqual([
      expect.objectContaining({ id: toUser.id, targetName: user.name }),
      {
        id: toTeam.id,
        type: NotifType.SCRIM_BOOKED,
        channel: NotifChannel.TEAM_CHANNEL,
        attempts: 6,
        lastError: "Discord says no",
        createdAt: new Date(LATER.getTime() + HOUR),
        scheduledFor: new Date(LATER.getTime() + HOUR),
        targetName: team.name,
      },
    ]);
    expect(list.map((entry) => entry.id)).not.toContain(sent.id);
  });

  it(`shows at most ${MAX_FAILED_SHOWN} entries and counts all of them`, async () => {
    const user = await createUser();
    for (let i = 0; i <= MAX_FAILED_SHOWN; i++) {
      await failed({ channel: NotifChannel.USER_DM, targetUserId: user.id }, LATER);
    }
    const { entries, total } = await listFailedNotifications(admin.id);
    expect(entries).toHaveLength(MAX_FAILED_SHOWN);
    expect(total).toBe(await prisma.notification.count({ where: { status: NotifStatus.FAILED } }));
    expect(total).toBeGreaterThan(MAX_FAILED_SHOWN);
  });
});
