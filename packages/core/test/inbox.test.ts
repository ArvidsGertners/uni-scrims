// The notification bell (SPEC N-32, ARCHITECTURE §5.34): entries from fanOut for every recipient,
// whatever their channels; list, texts and links; reading; leaving a team; retention; deletion and
// export.
import { NotifChannel, NotifStatus, NotifType, type Prisma, prisma } from "@uni-scrims/db";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  type Deliver,
  applyToRequest,
  banUser,
  countUnread,
  deleteAccount,
  deliverNotification,
  exportAccountData,
  inboxItemView,
  inboxStates,
  leaveTeam,
  listInbox,
  markConversationRead,
  markInboxRead,
  purgeOldInbox,
  removeMember,
  sendMessage,
} from "../src/index.ts";
import { INBOX_RETENTION_DAYS } from "../config/limits.ts";
import { writeInboxItems } from "../src/inbox.ts";
import { queueNotifications } from "../src/notifications.ts";
import {
  NOW,
  bookScrim,
  createFullyVerifiedTeam,
  createOpenRequest,
  createTeamWithMembers,
  createUser,
  uid,
  useAdmin,
} from "./helpers.ts";

const admin = useAdmin();

const DAY = 24 * 60 * 60 * 1000;
const NO_DEV_ENV = { NODE_ENV: "production" };
const deliver: Deliver = async () => ({ ok: true });

async function personal(where: Prisma.NotificationWhereInput) {
  return prisma.notification.findFirstOrThrow({
    where: { ...where, channel: NotifChannel.PERSONAL },
  });
}

async function itemsOf(sourceId: string) {
  return prisma.inboxItem.findMany({ where: { sourceId }, orderBy: { userId: "asc" } });
}

/** A bell entry written directly, for list and read tests. */
async function item(userId: string, overrides: Partial<Prisma.InboxItemUncheckedCreateInput> = {}) {
  return prisma.inboxItem.create({
    data: {
      userId,
      type: NotifType.CHANNEL_BROKEN,
      payload: { teamName: "Alpha" },
      sourceId: uid(),
      createdAt: NOW,
      ...overrides,
    },
  });
}

async function queueVerification(userId: string) {
  await queueNotifications(prisma, NOW, [
    {
      type: NotifType.VERIFICATION_RESULT,
      channel: NotifChannel.PERSONAL,
      entityId: uid(),
      targetUserId: userId,
      payload: { approved: false, rejectReason: null },
    },
  ]);
  return personal({ targetUserId: userId, type: NotifType.VERIFICATION_RESULT });
}

describe("fanOut writes the bell (§5.34)", () => {
  it("gives every member a team entry, whatever their channels", async () => {
    const { host, guest, scrim } = await bookScrim();
    const booked = await personal({
      scrimId: scrim.id,
      type: NotifType.SCRIM_BOOKED,
      targetTeamId: host.team.id,
    });
    expect(await deliverNotification(booked.id, NOW, deliver, NO_DEV_ENV)).toBe("DISTRIBUTED");
    const members = [host.captain, ...host.members].map(({ id }) => id).sort();
    const items = await itemsOf(booked.id);
    expect(items.map(({ userId }) => userId)).toEqual(members);
    for (const entry of items) {
      expect(entry).toMatchObject({
        type: NotifType.SCRIM_BOOKED,
        teamId: host.team.id,
        scrimId: scrim.id,
        requestId: booked.requestId,
        payload: booked.payload,
        createdAt: NOW,
        readAt: null,
      });
    }
    // Only the captain gets a DM by default (§5.17); the bell has everybody.
    const children = await prisma.notification.count({
      where: { dedupeKey: { contains: `:${booked.id}:` } },
    });
    expect(children).toBe(1);
    expect(await countUnread(guest.captain.id)).toBe(0);
  });

  it("gives a captain type to the captain only and a verification result to the person", async () => {
    const host = await createFullyVerifiedTeam();
    const guest = await createFullyVerifiedTeam();
    const request = await createOpenRequest(host.captain.id);
    await applyToRequest({
      userId: guest.captain.id,
      teamId: guest.team.id,
      requestId: request.id,
      now: NOW,
    });
    const received = await personal({
      requestId: request.id,
      type: NotifType.APPLICATION_RECEIVED,
    });
    await deliverNotification(received.id, NOW, deliver, NO_DEV_ENV);
    expect((await itemsOf(received.id)).map(({ userId }) => userId)).toEqual([host.captain.id]);

    const user = await createUser();
    const result = await queueVerification(user.id);
    await deliverNotification(result.id, NOW, deliver, NO_DEV_ENV);
    expect(await itemsOf(result.id)).toEqual([
      expect.objectContaining({
        userId: user.id,
        teamId: null,
        type: NotifType.VERIFICATION_RESULT,
      }),
    ]);
  });

  it("writes nothing for a dissolved team and never twice for one notification", async () => {
    const { team, captain } = await createTeamWithMembers();
    await queueNotifications(prisma, NOW, [
      {
        type: NotifType.CHANNEL_BROKEN,
        channel: NotifChannel.PERSONAL,
        entityId: uid(),
        targetTeamId: team.id,
        payload: { teamName: team.name },
      },
    ]);
    const broken = await personal({ targetTeamId: team.id, type: NotifType.CHANNEL_BROKEN });
    await leaveTeam({ userId: captain.id, teamId: team.id, now: NOW });
    expect(await deliverNotification(broken.id, NOW, deliver, NO_DEV_ENV)).toBe("CANCELLED");
    expect(await itemsOf(broken.id)).toEqual([]);

    const user = await createUser();
    const notification = {
      id: uid(),
      type: NotifType.CHANNEL_BROKEN,
      targetTeamId: null,
      requestId: null,
      scrimId: null,
    };
    for (let i = 0; i < 2; i++) {
      await prisma.$transaction((tx) =>
        writeInboxItems(tx, notification, { teamName: "Alpha" }, [{ userId: user.id }], NOW),
      );
    }
    expect(await itemsOf(notification.id)).toHaveLength(1);
  });

  it("leaves the parent SENT once and the retry of a fanned-out entry writes nothing", async () => {
    const user = await createUser();
    const result = await queueVerification(user.id);
    await deliverNotification(result.id, NOW, deliver, NO_DEV_ENV);
    expect(await deliverNotification(result.id, NOW, deliver, NO_DEV_ENV)).toBeNull();
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject(
      { status: NotifStatus.SENT },
    );
    expect(await itemsOf(result.id)).toHaveLength(1);
  });
});

describe("inboxItemView: texts and links per type", () => {
  const start = "2026-10-22T18:00:00.000Z";
  const base = {
    id: "i1",
    requestId: "req1",
    scrimId: "scr1",
    createdAt: NOW,
    readAt: null,
  };
  const scrimPayload = { opponentTeamName: "Beta", startsAt: start, format: "ONE_MAP" };
  const cases: [NotifType, Prisma.JsonValue, string][] = [
    [NotifType.VERIFICATION_RESULT, { approved: true, rejectReason: null }, "/verify"],
    [NotifType.APPLICATION_RECEIVED, { teamName: "Beta", startsAt: start }, "/requests/req1"],
    [NotifType.APPLICATION_REJECTED, { teamName: "Beta", startsAt: start }, "/scrims"],
    [NotifType.REQUEST_DELETED, { teamName: "Beta", startsAt: start }, "/scrims"],
    [
      NotifType.REQUEST_DELETED,
      { teamName: "Beta", startsAt: start, direct: true },
      "/scrims?tab=anfragen",
    ],
    [NotifType.REQUEST_EXPIRED, { teamName: "Beta", startsAt: start }, "/scrims"],
    [NotifType.SCRIM_BOOKED, scrimPayload, "/scrims/scr1"],
    [NotifType.SCRIM_CANCELLED, scrimPayload, "/scrims/scr1"],
    [NotifType.REMINDER_24H, scrimPayload, "/scrims/scr1"],
    [NotifType.REMINDER_1H, scrimPayload, "/scrims/scr1"],
    [NotifType.FEEDBACK_PROMPT, scrimPayload, "/scrims/scr1"],
    [NotifType.CHANNEL_BROKEN, { teamName: "Beta" }, "/team"],
    [
      NotifType.DIRECT_REQUEST_RECEIVED,
      { teamName: "Beta", startsAt: start, format: "ONE_MAP", weeklyUntil: null },
      "/requests/req1",
    ],
    [NotifType.DIRECT_REQUEST_DECLINED, { teamName: "Beta", startsAt: start }, "/requests/req1"],
    [NotifType.PARTNERSHIP_ENDED, { teamName: "Beta", startsAt: start }, "/scrims?tab=anfragen"],
    [
      NotifType.MESSAGE_RECEIVED,
      { teamName: "Beta", startsAt: start, context: "SCRIM", guestTeamId: "g1", toGuest: true },
      "/scrims/scr1?chat=g1",
    ],
    [
      NotifType.MESSAGE_RECEIVED,
      {
        teamName: "Beta",
        startsAt: start,
        context: "APPLICATION",
        guestTeamId: "g1",
        toGuest: false,
      },
      "/requests/req1?chat=g1",
    ],
  ];

  it("covers every type", () => {
    expect(new Set(cases.map(([type]) => type))).toEqual(new Set(Object.values(NotifType)));
  });

  it.each(cases)("%s links to the right page in both languages", (type, payload, href) => {
    const de = inboxItemView({ ...base, type, payload }, "de");
    const en = inboxItemView({ ...base, type, payload }, "en");
    expect(de?.href).toBe(href);
    expect(en?.href).toBe(href);
    expect(de?.title).not.toBe(en?.title);
    expect(de?.description).not.toBe("");
    // Names in plain text, never Discord markdown.
    expect(de?.description).not.toContain("**");
    if (type !== NotifType.VERIFICATION_RESULT) expect(de?.description).toContain("Beta");
  });

  it("names the team and says nothing of the message text", () => {
    const view = inboxItemView(
      {
        ...base,
        type: NotifType.SCRIM_BOOKED,
        payload: scrimPayload,
      },
      "de",
    );
    expect(view).toMatchObject({
      title: "Scrim gebucht",
      description:
        "Euer Scrim gegen Beta steht. Sprecht die Lobby mit dem gegnerischen Captain ab.",
      read: false,
    });
  });

  it("leaves out an entry whose payload does not match its type", () => {
    expect(inboxItemView({ ...base, type: NotifType.SCRIM_BOOKED, payload: {} }, "de")).toBeNull();
  });
});

describe("reading the bell", () => {
  it("lists the own entries newest first, at most 50, in the page's language", async () => {
    const user = await createUser();
    const other = await createUser();
    for (let i = 0; i < 52; i++) {
      await item(user.id, { createdAt: new Date(NOW.getTime() + i * 1000) });
    }
    await item(user.id, { createdAt: new Date(NOW.getTime() + DAY), payload: {} });
    await item(other.id, { createdAt: new Date(NOW.getTime() + 2 * DAY) });
    const entries = await listInbox({ userId: user.id, locale: "en" });
    expect(entries).toHaveLength(49);
    expect(entries[0]!.createdAt).toEqual(new Date(NOW.getTime() + 51 * 1000));
    expect(entries.every(({ title }) => title === "Team channel disconnected")).toBe(true);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1]!.createdAt.getTime()).toBeGreaterThan(entries[i]!.createdAt.getTime());
    }
  });

  it("reads one own entry or all of them, never another person's", async () => {
    const user = await createUser();
    const other = await createUser();
    const first = await item(user.id);
    await item(user.id);
    const foreign = await item(other.id);
    expect(await countUnread(user.id)).toBe(2);
    const later = new Date(NOW.getTime() + 1000);
    expect(await markInboxRead({ userId: user.id, itemId: foreign.id, now: later })).toBe(false);
    expect(await markInboxRead({ userId: user.id, itemId: first.id, now: later })).toBe(true);
    expect(await markInboxRead({ userId: user.id, itemId: first.id, now: later })).toBe(false);
    expect(await countUnread(user.id)).toBe(1);
    expect(await markInboxRead({ userId: user.id, now: later })).toBe(true);
    expect(await countUnread(user.id)).toBe(0);
    expect(await countUnread(other.id)).toBe(1);
    expect((await listInbox({ userId: user.id, locale: "de" })).every(({ read }) => read)).toBe(
      true,
    );
  });

  it("gives the WebSocket server count and newest unread entry per user in one call", async () => {
    const user = await createUser();
    const empty = await createUser();
    await item(user.id, { createdAt: NOW });
    await item(user.id, { createdAt: new Date(NOW.getTime() + 5000) });
    await item(user.id, { createdAt: new Date(NOW.getTime() + 9000), readAt: NOW });
    const states = await inboxStates([user.id, empty.id]);
    expect(states.get(user.id)).toEqual({ unread: 2, latest: new Date(NOW.getTime() + 5000) });
    expect(states.get(empty.id)).toEqual({ unread: 0, latest: null });
    expect(await inboxStates([])).toEqual(new Map());
  });

  it("reads the thread's 'Neue Nachricht' with the thread, and only that one (SPEC N-32)", async () => {
    const host = await createFullyVerifiedTeam();
    const first = await createFullyVerifiedTeam();
    const second = await createFullyVerifiedTeam();
    const request = await createOpenRequest(host.captain.id);
    for (const guest of [first, second]) {
      await applyToRequest({
        userId: guest.captain.id,
        teamId: guest.team.id,
        requestId: request.id,
        now: NOW,
      });
      await sendMessage({
        userId: guest.captain.id,
        teamId: guest.team.id,
        requestId: request.id,
        guestTeamId: guest.team.id,
        body: "Hallo",
        now: NOW,
      });
    }
    const received = await prisma.notification.findMany({
      where: {
        requestId: request.id,
        type: NotifType.MESSAGE_RECEIVED,
        channel: NotifChannel.PERSONAL,
      },
    });
    expect(received).toHaveLength(2);
    for (const notification of received) {
      await deliverNotification(notification.id, NOW, deliver, NO_DEV_ENV);
    }
    const member = host.members[0]!;
    expect(await countUnread(member.id)).toBe(2);
    const read = await markConversationRead({
      userId: member.id,
      teamId: host.team.id,
      requestId: request.id,
      guestTeamId: first.team.id,
      now: NOW,
    });
    expect(read).toEqual({ inboxChanged: true });
    expect(await countUnread(member.id)).toBe(1);
    // The captain's copy stays unread: read per person.
    expect(await countUnread(host.captain.id)).toBe(2);
    const again = await markConversationRead({
      userId: member.id,
      teamId: host.team.id,
      requestId: request.id,
      guestTeamId: first.team.id,
      now: NOW,
    });
    expect(again).toEqual({ inboxChanged: false });
  });
});

describe("leaving a team removes its entries (§5.34)", () => {
  async function teamWithEntries() {
    const { team, captain, members } = await createTeamWithMembers({ extraMembers: 2 });
    for (const person of [captain, ...members]) await item(person.id, { teamId: team.id });
    return { team, captain, members };
  }

  it("on leaving, removal, ban and dissolving, keeping the rest", async () => {
    const { team, captain, members } = await teamWithEntries();
    const [leaving, removed] = members;
    const other = await createTeamWithMembers();
    await prisma.teamMember.create({
      data: { teamId: other.team.id, userId: leaving!.id, joinedAt: NOW },
    });
    await item(leaving!.id, { teamId: other.team.id });
    await item(leaving!.id, { teamId: null });

    await leaveTeam({ userId: leaving!.id, teamId: team.id, now: NOW });
    expect(await prisma.inboxItem.count({ where: { userId: leaving!.id } })).toBe(2);
    expect(await prisma.inboxItem.count({ where: { userId: leaving!.id, teamId: team.id } })).toBe(
      0,
    );

    await removeMember({ userId: captain.id, teamId: team.id, memberId: removed!.id });
    expect(await prisma.inboxItem.count({ where: { userId: removed!.id } })).toBe(0);
    expect(await prisma.inboxItem.count({ where: { userId: captain.id } })).toBe(1);

    // Dissolving: the last member leaves.
    await leaveTeam({ userId: captain.id, teamId: team.id, now: NOW });
    expect(await prisma.inboxItem.count({ where: { teamId: team.id } })).toBe(0);
  });

  it("when a ban removes the member from a team", async () => {
    const { team, members } = await teamWithEntries();
    const banned = members[0]!;
    await banUser({ adminId: admin.id, userId: banned.id, uploadDir: tmpdir(), now: NOW });
    expect(await prisma.inboxItem.count({ where: { userId: banned.id } })).toBe(0);
    expect(await prisma.inboxItem.count({ where: { teamId: team.id } })).toBe(2);
  });
});

describe("retention, deletion and export", () => {
  it("deletes entries 30 days after they arrived", async () => {
    const user = await createUser();
    const old = await item(user.id, { createdAt: NOW });
    const cutoff = new Date(NOW.getTime() + INBOX_RETENTION_DAYS * DAY);
    await purgeOldInbox(cutoff);
    expect(await prisma.inboxItem.count({ where: { id: old.id } })).toBe(1);
    expect(await purgeOldInbox(new Date(cutoff.getTime() + 1))).toBeGreaterThanOrEqual(1);
    expect(await prisma.inboxItem.count({ where: { id: old.id } })).toBe(0);
  });

  it("deletes the person's entries with the account", async () => {
    const user = await createUser();
    await item(user.id);
    await deleteAccount({ userId: user.id, uploadDir: tmpdir(), now: NOW });
    expect(await prisma.inboxItem.count({ where: { userId: user.id } })).toBe(0);
  });

  it("lists the entries in the export", async () => {
    const { team, members } = await createTeamWithMembers({ extraMembers: 1 });
    const member = members[0]!;
    await item(member.id, {
      teamId: team.id,
      type: NotifType.CHANNEL_BROKEN,
      payload: { teamName: team.name },
      readAt: new Date(NOW.getTime() + 1000),
    });
    const later = new Date(NOW.getTime() + 2000);
    await item(member.id, {
      type: NotifType.SCRIM_BOOKED,
      payload: { broken: true },
      createdAt: later,
    });
    const data = await exportAccountData({
      userId: member.id,
      now: NOW,
      privacyPolicyUrl: "https://uniscrims.test/datenschutz",
      uploadDir: tmpdir(),
    });
    expect(data.glocke).toEqual([
      {
        art: expect.any(String),
        team: team.name,
        inhalt: {
          titel: "Team-Channel getrennt",
          text: expect.stringContaining(team.name),
        },
        erhaltenAm: NOW,
        gelesenAm: new Date(NOW.getTime() + 1000),
      },
      {
        art: expect.any(String),
        team: null,
        inhalt: { broken: true },
        erhaltenAm: later,
        gelesenAm: null,
      },
    ]);
  });
});
