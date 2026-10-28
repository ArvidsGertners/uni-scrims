// Notifications for staff (Phase 37, SPEC N-33, ARCHITECTURE §5.35): triggers, the audience by role
// and 2FA, bell always and DM per setting, relevance, closing a case on every path, role changes,
// settings, texts and links.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FeedbackOutcome,
  NotifChannel,
  NotifStatus,
  NotifType,
  ScrimStatus,
  StaffRole,
  prisma,
} from "@uni-scrims/db";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  CREDENTIAL_PROVIDER,
  type Deliver,
  applyToRequest,
  autoRejectStaleVerifications,
  banUser,
  decideTeamLimitRequest,
  decideVerification,
  deleteAccount,
  deleteOwnMessage,
  deliverNotification,
  dismissMessageReports,
  getNotificationPreferences,
  getStaffNotificationPreferences,
  inboxItemView,
  removeReportedMessage,
  reportMessage,
  resolveDispute,
  sendMessage,
  setNotificationPreferences,
  setStaffNotificationPreferences,
  setStaffRole,
  staffTypesFor,
  submitFeedback,
  submitTeamLimitRequest,
  submitVerification,
} from "../src/index.ts";
import { dedupeKey } from "../src/notifications.ts";
import {
  NOW,
  REQUEST_STARTS_AT,
  bookScrim,
  createFullyVerifiedTeam,
  createOpenRequest,
  createUser,
} from "./helpers.ts";

const NO_DEV_ENV = { NODE_ENV: "production" };
const deliver: Deliver = async () => ({ ok: true });
const HOUR = 60 * 60 * 1000;
const PDF = new TextEncoder().encode(
  "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n",
);
const REASON = "Ich spiele in drei Uni-Teams und brauche ein viertes.";

let uploadDir: string;
let reviewer: Awaited<ReturnType<typeof createUser>>;
let admin: Awaited<ReturnType<typeof createUser>>;
let operator: Awaited<ReturnType<typeof createUser>>;
let without2fa: Awaited<ReturnType<typeof createUser>>;
let bannedAdmin: Awaited<ReturnType<typeof createUser>>;

beforeAll(async () => {
  reviewer = await createUser({ verified: true, staffRole: StaffRole.REVIEWER });
  admin = await createUser({ verified: true, staffRole: StaffRole.ADMIN });
  operator = await createUser({ verified: true, staffRole: StaffRole.OPERATOR });
  without2fa = await createUser({ staffRole: StaffRole.ADMIN, twoFactor: false });
  bannedAdmin = await createUser({ staffRole: StaffRole.ADMIN, banned: true });
});

beforeEach(async () => {
  uploadDir = await mkdtemp(path.join(tmpdir(), "uni-scrims-staff-"));
});

/** The staff notification of a case, before it is fanned out. */
async function parentOf(type: NotifType, entityId: string) {
  return prisma.notification.findUniqueOrThrow({
    where: {
      dedupeKey: dedupeKey({
        type,
        entityId,
        channel: NotifChannel.PERSONAL,
        payload: {},
      } as Parameters<typeof dedupeKey>[0]),
    },
  });
}

async function fannedOut(type: NotifType, entityId: string) {
  const parent = await parentOf(type, entityId);
  expect(await deliverNotification(parent.id, NOW, deliver, NO_DEV_ENV)).toBe("DISTRIBUTED");
  const items = await prisma.inboxItem.findMany({ where: { sourceId: parent.id } });
  const children = await prisma.notification.findMany({
    where: { dedupeKey: { startsWith: `${type}:${parent.id}:` } },
  });
  return { parent, items, children };
}

async function pendingVerification() {
  const player = await createUser();
  const request = await submitVerification({
    userId: player.id,
    universityOther: "Hochschule Irgendwo",
    consent: true,
    file: PDF,
    uploadDir,
    now: NOW,
  });
  return { player, request };
}

async function pendingTeamLimit() {
  const player = await createUser();
  await submitTeamLimitRequest({ userId: player.id, reason: REASON, now: NOW });
  const request = await prisma.teamLimitRequest.findFirstOrThrow({ where: { userId: player.id } });
  return { player, request };
}

async function reportedMessage() {
  const host = await createFullyVerifiedTeam();
  const guest = await createFullyVerifiedTeam();
  const request = await createOpenRequest(host.captain.id);
  await applyToRequest({
    userId: guest.captain.id,
    teamId: guest.team.id,
    requestId: request.id,
    now: NOW,
  });
  const key = { requestId: request.id, guestTeamId: guest.team.id };
  // A member, not the captain, so the account can be deleted without handing over the role.
  const author = guest.members[0]!;
  await sendMessage({
    userId: author.id,
    teamId: guest.team.id,
    ...key,
    body: "unfreundlich",
    now: NOW,
  });
  const message = await prisma.message.findFirstOrThrow({ where: { authorId: author.id } });
  await reportMessage({
    userId: host.captain.id,
    teamId: host.team.id,
    messageId: message.id,
    now: NOW,
  });
  const report = await prisma.messageReport.findFirstOrThrow({ where: { messageId: message.id } });
  return { host, guest, author, message, report };
}

async function disputedScrim() {
  const { host, guest, scrim } = await bookScrim();
  const after = new Date(REQUEST_STARTS_AT.getTime() + HOUR);
  await submitFeedback({
    userId: host.captain.id,
    teamId: host.team.id,
    scrimId: scrim.id,
    outcome: FeedbackOutcome.PLAYED,
    rating: 4,
    now: after,
  });
  await submitFeedback({
    userId: guest.captain.id,
    teamId: guest.team.id,
    scrimId: scrim.id,
    outcome: FeedbackOutcome.OPPONENT_NO_SHOW,
    now: after,
  });
  return { host, guest, scrim, after };
}

const ids = (rows: { userId: string | null }[]) => rows.map(({ userId }) => userId);
const dmTargets = (children: { channel: NotifChannel; targetUserId: string | null }[]) =>
  children.filter(({ channel }) => channel === NotifChannel.USER_DM).map((c) => c.targetUserId);

describe("the audience (§5.35)", () => {
  it("tells every staff member with access to the queue of a new verification", async () => {
    const { player, request } = await pendingVerification();
    const parent = await parentOf(NotifType.STAFF_VERIFICATION_PENDING, request.id);
    expect(parent).toMatchObject({
      channel: NotifChannel.PERSONAL,
      targetUserId: null,
      targetTeamId: null,
      payload: { verificationId: request.id },
    });
    const { items, children } = await fannedOut(NotifType.STAFF_VERIFICATION_PENDING, request.id);
    const recipients = ids(items);
    expect(recipients).toEqual(expect.arrayContaining([reviewer.id, admin.id, operator.id]));
    // Without 2FA, banned, or without a role: nothing.
    for (const other of [without2fa, bannedAdmin, player]) {
      expect(recipients).not.toContain(other.id);
    }
    // One DM each, never a mail (SPEC N-33).
    expect(dmTargets(children)).toEqual(expect.arrayContaining([reviewer.id, admin.id]));
    expect(children.some(({ channel }) => channel === NotifChannel.USER_EMAIL)).toBe(false);
  });

  it("sends the admin types to admins and the operator, not to reviewers", async () => {
    const { request } = await pendingTeamLimit();
    const { items } = await fannedOut(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id);
    expect(ids(items)).toEqual(expect.arrayContaining([admin.id, operator.id]));
    expect(ids(items)).not.toContain(reviewer.id);
  });

  it("keeps the bell when Discord is off for a type", async () => {
    const quiet = await createUser({ verified: true, staffRole: StaffRole.ADMIN });
    await setStaffNotificationPreferences({
      staffId: quiet.id,
      preferences: { STAFF_TEAM_LIMIT_REQUEST: false },
    });
    const { request } = await pendingTeamLimit();
    const { items, children } = await fannedOut(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id);
    expect(ids(items)).toContain(quiet.id);
    expect(dmTargets(children)).not.toContain(quiet.id);
    expect(dmTargets(children)).toContain(admin.id);
  });

  it("drops a DM whose recipient lost the role meanwhile", async () => {
    const leaving = await createUser({ verified: true, staffRole: StaffRole.ADMIN });
    const { request } = await pendingTeamLimit();
    const { children } = await fannedOut(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id);
    await setStaffRole({ operatorId: operator.id, userId: leaving.id, role: null });
    const dm = children.find((child) => child.targetUserId === leaving.id)!;
    expect(await deliverNotification(dm.id, NOW, deliver, NO_DEV_ENV)).toBe("CANCELLED");
  });
});

describe("closing a case (§5.35)", () => {
  it("does not announce a case closed before the fan-out", async () => {
    const { request } = await pendingTeamLimit();
    await decideTeamLimitRequest({
      adminId: admin.id,
      requestId: request.id,
      decision: "REJECTED",
      now: NOW,
    });
    const parent = await parentOf(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id);
    expect(await deliverNotification(parent.id, NOW, deliver, NO_DEV_ENV)).toBe("CANCELLED");
    expect(await prisma.inboxItem.count({ where: { sourceId: parent.id } })).toBe(0);
  });

  it("reads every copy once decided and drops the DMs not sent yet", async () => {
    const { request } = await pendingVerification();
    const { parent, children } = await fannedOut(NotifType.STAFF_VERIFICATION_PENDING, request.id);
    const later = new Date(NOW.getTime() + HOUR);
    await decideVerification({
      requestId: request.id,
      adminId: reviewer.id,
      decision: "REJECTED",
      rejectReason: "Unleserlich",
      uploadDir,
      now: later,
    });
    const items = await prisma.inboxItem.findMany({ where: { sourceId: parent.id } });
    expect(items.length).toBeGreaterThan(1);
    expect(items.every(({ readAt }) => readAt?.getTime() === later.getTime())).toBe(true);
    const dm = children.find((child) => child.channel === NotifChannel.USER_DM)!;
    expect(await deliverNotification(dm.id, later, deliver, NO_DEV_ENV)).toBe("CANCELLED");
  });

  async function unread(type: NotifType, entityId: string) {
    const parent = await parentOf(type, entityId);
    return prisma.inboxItem.count({ where: { sourceId: parent.id, readAt: null } });
  }

  it("closes a verification with the automatic rejection, a ban and the account deletion", async () => {
    const stale = await pendingVerification();
    const banned = await pendingVerification();
    const deleted = await pendingVerification();
    for (const { request } of [stale, banned, deleted]) {
      await fannedOut(NotifType.STAFF_VERIFICATION_PENDING, request.id);
    }
    await prisma.verificationRequest.update({
      where: { id: stale.request.id },
      data: { createdAt: new Date(NOW.getTime() - 30 * 24 * HOUR) },
    });
    await autoRejectStaleVerifications(NOW, uploadDir);
    await banUser({ adminId: admin.id, userId: banned.player.id, uploadDir, now: NOW });
    await deleteAccount({ userId: deleted.player.id, uploadDir, now: NOW });
    for (const { request } of [stale, banned, deleted]) {
      expect(await unread(NotifType.STAFF_VERIFICATION_PENDING, request.id)).toBe(0);
    }
  });

  it("closes a team limit request with the account deletion", async () => {
    const { player, request } = await pendingTeamLimit();
    await fannedOut(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id);
    await deleteAccount({ userId: player.id, uploadDir, now: NOW });
    expect(await unread(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id)).toBe(0);
  });

  it("announces a report without the text and closes it on every path", async () => {
    const dismissed = await reportedMessage();
    expect((await parentOf(NotifType.STAFF_MESSAGE_REPORTED, dismissed.report.id)).payload).toEqual(
      { messageId: dismissed.message.id },
    );
    const removed = await reportedMessage();
    const ownDeleted = await reportedMessage();
    const authorDeleted = await reportedMessage();
    for (const { report } of [dismissed, removed, ownDeleted, authorDeleted]) {
      await fannedOut(NotifType.STAFF_MESSAGE_REPORTED, report.id);
    }
    await dismissMessageReports({ adminId: admin.id, messageId: dismissed.message.id, now: NOW });
    await removeReportedMessage({ adminId: admin.id, messageId: removed.message.id, now: NOW });
    await deleteOwnMessage({
      userId: ownDeleted.author.id,
      messageId: ownDeleted.message.id,
      now: NOW,
    });
    await deleteAccount({ userId: authorDeleted.author.id, uploadDir, now: NOW });
    for (const { report } of [dismissed, removed, ownDeleted, authorDeleted]) {
      expect(await unread(NotifType.STAFF_MESSAGE_REPORTED, report.id)).toBe(0);
    }
  });

  it("announces a dispute with the teams and the date, and the decision closes it", async () => {
    const { host, guest, scrim, after } = await disputedScrim();
    expect(await prisma.scrim.findUnique({ where: { id: scrim.id } })).toMatchObject({
      status: ScrimStatus.DISPUTED,
    });
    const parent = await parentOf(NotifType.STAFF_DISPUTE, scrim.id);
    expect(parent).toMatchObject({
      scrimId: scrim.id,
      payload: {
        hostTeamName: host.team.name,
        guestTeamName: guest.team.name,
        startsAt: REQUEST_STARTS_AT.toISOString(),
      },
    });
    expect(await deliverNotification(parent.id, after, deliver, NO_DEV_ENV)).toBe("DISTRIBUTED");
    await resolveDispute({ adminId: admin.id, scrimId: scrim.id, decision: "PLAYED", now: after });
    expect(await unread(NotifType.STAFF_DISPUTE, scrim.id)).toBe(0);
  });

  it("does not announce a scrim that both teams agree on", async () => {
    const { host, guest, scrim } = await bookScrim();
    const after = new Date(REQUEST_STARTS_AT.getTime() + HOUR);
    for (const side of [host, guest]) {
      await submitFeedback({
        userId: side.captain.id,
        teamId: side.team.id,
        scrimId: scrim.id,
        outcome: FeedbackOutcome.PLAYED,
        rating: 4,
        now: after,
      });
    }
    expect(
      await prisma.notification.count({
        where: { type: NotifType.STAFF_DISPUTE, scrimId: scrim.id },
      }),
    ).toBe(0);
  });
});

describe("role changes (§5.35)", () => {
  it("deletes the entries of areas the new role does not see", async () => {
    const changing = await createUser({ verified: true, staffRole: StaffRole.ADMIN });
    // A role needs a complete account with a password (§5.9).
    await prisma.user.update({
      where: { id: changing.id },
      data: { email: `staff.${changing.id}@example.org` },
    });
    await prisma.account.create({
      data: {
        id: `${changing.id}-credential`,
        userId: changing.id,
        accountId: changing.id,
        providerId: CREDENTIAL_PROVIDER,
        password: "hash",
      },
    });
    const verification = await pendingVerification();
    const limit = await pendingTeamLimit();
    await fannedOut(NotifType.STAFF_VERIFICATION_PENDING, verification.request.id);
    await fannedOut(NotifType.STAFF_TEAM_LIMIT_REQUEST, limit.request.id);
    const types = async () =>
      (await prisma.inboxItem.findMany({ where: { userId: changing.id } })).map(({ type }) => type);
    expect(await types()).toEqual(
      expect.arrayContaining([
        NotifType.STAFF_VERIFICATION_PENDING,
        NotifType.STAFF_TEAM_LIMIT_REQUEST,
      ]),
    );
    await setStaffRole({ operatorId: operator.id, userId: changing.id, role: StaffRole.REVIEWER });
    expect(await types()).toEqual([NotifType.STAFF_VERIFICATION_PENDING]);
    await setStaffRole({ operatorId: operator.id, userId: changing.id, role: null });
    expect(await types()).toEqual([]);
  });
});

describe("settings (§5.35)", () => {
  it("offers Discord for the types of the own areas, on by default", async () => {
    expect(await getStaffNotificationPreferences(reviewer.id)).toEqual([
      { type: NotifType.STAFF_VERIFICATION_PENDING, discord: true },
    ]);
    expect((await getStaffNotificationPreferences(admin.id)).map(({ type }) => type)).toEqual(
      staffTypesFor(StaffRole.ADMIN),
    );
    await expect(getStaffNotificationPreferences(without2fa.id)).rejects.toMatchObject({
      code: "TWO_FACTOR_REQUIRED",
    });
  });

  it("stores off as a choice and on as the default, only for the own areas", async () => {
    const own = await createUser({ verified: true, staffRole: StaffRole.REVIEWER });
    await setStaffNotificationPreferences({
      staffId: own.id,
      preferences: { STAFF_VERIFICATION_PENDING: false, STAFF_DISPUTE: false },
    });
    const rows = async () => prisma.notificationPreference.findMany({ where: { userId: own.id } });
    expect(await rows()).toEqual([
      expect.objectContaining({
        type: NotifType.STAFF_VERIFICATION_PENDING,
        discord: false,
        email: null,
      }),
    ]);
    await setStaffNotificationPreferences({
      staffId: own.id,
      preferences: { STAFF_VERIFICATION_PENDING: true },
    });
    expect(await rows()).toEqual([]);
    // A type the form did not show stays as it is.
    await setStaffNotificationPreferences({
      staffId: own.id,
      preferences: { STAFF_VERIFICATION_PENDING: false },
    });
    await setStaffNotificationPreferences({ staffId: own.id, preferences: {} });
    expect(await rows()).toHaveLength(1);
    await expect(
      setStaffNotificationPreferences({ staffId: own.id, preferences: { SCRIM_BOOKED: false } }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("keeps the staff types out of the player settings", async () => {
    const settings = await getNotificationPreferences(admin.id);
    const types = settings.categories.flatMap((category) => category.types.map((t) => t.type));
    expect(types.some((type) => type.startsWith("STAFF_"))).toBe(false);
    const all = Object.fromEntries(types.map((type) => [type, { discord: true, email: false }]));
    await expect(
      setNotificationPreferences({
        userId: admin.id,
        preferences: { ...all, STAFF_DISPUTE: { discord: false, email: true } },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("keeps the DM banner while a staff type still goes to Discord", async () => {
    const staff = await createUser({ verified: true, staffRole: StaffRole.REVIEWER });
    await prisma.user.update({ where: { id: staff.id }, data: { dmFailedAt: NOW } });
    const settings = await getNotificationPreferences(staff.id);
    const off = Object.fromEntries(
      settings.categories.flatMap((category) =>
        category.types.map((t) => [t.type, { discord: false, email: false }]),
      ),
    );
    await setNotificationPreferences({ userId: staff.id, preferences: off });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).dmFailedAt).toEqual(
      NOW,
    );
    await setStaffNotificationPreferences({
      staffId: staff.id,
      preferences: { STAFF_VERIFICATION_PENDING: false },
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).dmFailedAt,
    ).toBeNull();
  });
});

describe("texts and links (§5.35)", () => {
  const item = (type: NotifType, payload: object) => ({
    id: "item-1",
    type,
    payload,
    requestId: null,
    scrimId: type === NotifType.STAFF_DISPUTE ? "scrim-1" : null,
    createdAt: NOW,
    readAt: null,
  });
  const cases = [
    [NotifType.STAFF_VERIFICATION_PENDING, { verificationId: "v" }, "/queue", "Neue Verifizierung"],
    [NotifType.STAFF_MESSAGE_REPORTED, { messageId: "m" }, "/reports", "Nachricht gemeldet"],
    [
      NotifType.STAFF_TEAM_LIMIT_REQUEST,
      { teamLimitRequestId: "t" },
      "/team-limits",
      "Antrag auf mehr Teams",
    ],
    [
      NotifType.STAFF_DISPUTE,
      { hostTeamName: "Alpha", guestTeamName: "Beta", startsAt: REQUEST_STARTS_AT.toISOString() },
      "/disputes",
      "Strittiges Scrim",
    ],
  ] as const;

  it.each(cases)("shows %s with a link into the admin area", (type, payload, href, title) => {
    expect(inboxItemView(item(type, payload), "de")).toMatchObject({
      title,
      href,
      admin: true,
      read: false,
    });
    const english = inboxItemView(item(type, payload), "en")!;
    expect(english.title).not.toBe(title);
    expect(english.href).toBe(href);
  });

  it("names the teams and the day of a dispute, nobody else", () => {
    const [, payload] = cases[3];
    expect(inboxItemView(item(NotifType.STAFF_DISPUTE, payload), "de")!.description).toBe(
      "Die Feedbacks von Alpha und Beta zum Scrim am 22.10.2026 widersprechen sich. Der Streitfall wartet auf eine Entscheidung.",
    );
  });

  it("leaves the player notifications on the site", () => {
    expect(
      inboxItemView(item(NotifType.CHANNEL_BROKEN, { teamName: "Alpha" }), "de"),
    ).toMatchObject({ admin: false, href: "/team" });
  });
});

describe("relevance of the stored states", () => {
  it("cancels a staff notification whose case is gone", async () => {
    const { request } = await pendingTeamLimit();
    const parent = await parentOf(NotifType.STAFF_TEAM_LIMIT_REQUEST, request.id);
    await prisma.teamLimitRequest.delete({ where: { id: request.id } });
    expect(await deliverNotification(parent.id, NOW, deliver, NO_DEV_ENV)).toBe("CANCELLED");
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe(
      NotifStatus.CANCELLED,
    );
  });
});
