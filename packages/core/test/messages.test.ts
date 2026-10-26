// Messages between teams (SPEC N-28, ARCHITECTURE §5.30). The test DB is shared by all files, so the
// checks only look at this file's rows; the partnership made here is ended at the end.
import { tmpdir } from "node:os";
import {
  AppStatus,
  NotifChannel,
  NotifType,
  RequestStatus,
  ScrimStatus,
  StaffRole,
  prisma,
} from "@uni-scrims/db";
import { afterAll, describe, expect, it } from "vitest";
import {
  type ConversationStateInput,
  acceptDirectRequest,
  applyToRequest,
  banTeam,
  banUser,
  cancelScrim,
  confirmApplication,
  conversationState,
  createRequest,
  declineDirectRequest,
  deleteAccount,
  deleteOwnMessage,
  dismissMessageReports,
  exportAccountData,
  getAdminOverview,
  getConversation,
  getMyScrims,
  getRequestDetail,
  getScrimDetail,
  leaveTeam,
  listMessageReports,
  markConversationRead,
  openFeedback,
  postSeriesRequests,
  purgeOldConversations,
  removeReportedMessage,
  reportMessage,
  sendMessage,
  submitFeedback,
  withdrawApplication,
} from "../src/index.ts";
import {
  NOW,
  REQUEST_INPUT,
  REQUEST_STARTS_AT,
  createOpenRequest,
  createTeamWithMembers,
  createUser,
  useAdmin,
} from "./helpers.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const admin = useAdmin();
const seriesIds: string[] = [];

afterAll(async () => {
  await prisma.requestSeries.updateMany({
    where: { id: { in: seriesIds }, endedAt: null },
    data: { endedAt: NOW },
  });
});

type Team = Awaited<ReturnType<typeof createTeamWithMembers>>;

/** A team with a verified captain and one unverified member, who may write too (SPEC N-28). */
function team() {
  return createTeamWithMembers({ extraMembers: 1, verifiedMembers: false });
}

/** Host's board request and the guest's pending application. */
async function applied() {
  const host = await team();
  const guest = await team();
  const request = await createOpenRequest(host.captain.id);
  const { application } = await applyToRequest({
    userId: guest.captain.id,
    teamId: guest.team.id,
    requestId: request.id,
    now: NOW,
  });
  const key = { requestId: request.id, guestTeamId: guest.team.id };
  return { host, guest, request, application, key };
}

function send(
  user: { id: string },
  teamOf: Team,
  key: { requestId: string; guestTeamId: string },
  body = "Lobby um 19:50?",
  now = NOW,
) {
  return sendMessage({ userId: user.id, teamId: teamOf.team.id, ...key, body, now });
}

function read(
  user: { id: string },
  teamOf: Team,
  key: { requestId: string; guestTeamId: string },
  now = NOW,
) {
  return markConversationRead({ userId: user.id, teamId: teamOf.team.id, ...key, now });
}

function view(
  user: { id: string },
  teamOf: Team,
  key: { requestId: string; guestTeamId: string },
  now = NOW,
) {
  return getConversation({ userId: user.id, teamId: teamOf.team.id, ...key, now });
}

/** The MESSAGE_RECEIVED entries to a team (the parents; the sender fans them out later). */
function notificationsTo(teamId: string) {
  return prisma.notification.findMany({
    where: {
      type: NotifType.MESSAGE_RECEIVED,
      targetTeamId: teamId,
      channel: NotifChannel.PERSONAL,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function bookFrom(setup: Awaited<ReturnType<typeof applied>>) {
  return confirmApplication({
    userId: setup.host.captain.id,
    requestId: setup.request.id,
    applicationId: setup.application.id,
    now: NOW,
  });
}

const ACTIVE = { bannedAt: null, dissolvedAt: null };

describe("conversationState", () => {
  const base: ConversationStateInput = {
    request: {
      teamId: "host",
      targetTeamId: null,
      status: RequestStatus.OPEN,
      startsAt: REQUEST_STARTS_AT,
    },
    host: ACTIVE,
    guest: ACTIVE,
    guestTeamId: "guest",
    application: { status: AppStatus.PENDING },
    scrim: null,
  };
  const state = (overrides: Partial<ConversationStateInput>, now = NOW) =>
    conversationState({ ...base, ...overrides }, now);

  it("exists for an applicant, open while the application is pending and the request open", () => {
    expect(state({})).toEqual({ exists: true, writable: true });
    expect(state({ application: { status: AppStatus.WITHDRAWN } })).toEqual({
      exists: true,
      writable: false,
    });
    expect(state({ application: { status: AppStatus.REJECTED } }).writable).toBe(false);
    expect(state({}, REQUEST_STARTS_AT).writable).toBe(false);
    expect(state({ application: null }).exists).toBe(false);
    expect(state({ guestTeamId: "host" }).exists).toBe(false);
  });

  it("exists for the target of a direct request only", () => {
    const direct = { ...base.request, targetTeamId: "guest" };
    expect(state({ request: direct, application: null })).toEqual({ exists: true, writable: true });
    expect(state({ request: direct, application: null, guestTeamId: "other" }).exists).toBe(false);
    expect(
      state({ request: { ...direct, status: RequestStatus.DECLINED }, application: null }),
    ).toEqual({ exists: true, writable: false });
  });

  it("follows the scrim once booked: open until the feedback is evaluated", () => {
    const booked = { ...base.request, status: RequestStatus.BOOKED };
    const scrim = (status: ScrimStatus) => ({ guestTeamId: "guest", status });
    expect(
      state({
        request: booked,
        application: { status: AppStatus.ACCEPTED },
        scrim: scrim(ScrimStatus.SCHEDULED),
      }),
    ).toEqual({ exists: true, writable: true });
    // After the start too, while feedback runs; the request is not open anymore.
    expect(
      state(
        { request: booked, scrim: scrim(ScrimStatus.AWAITING_FEEDBACK) },
        new Date(REQUEST_STARTS_AT.getTime() + 4 * HOUR),
      ).writable,
    ).toBe(true);
    for (const status of [ScrimStatus.CANCELLED, ScrimStatus.COMPLETED, ScrimStatus.NO_SHOW]) {
      expect(state({ request: booked, scrim: scrim(status) })).toEqual({
        exists: true,
        writable: false,
      });
    }
    // A partner date has no application.
    expect(
      state({ request: booked, application: null, scrim: scrim(ScrimStatus.SCHEDULED) }),
    ).toEqual({ exists: true, writable: true });
    // Another applicant of a request booked with someone else: read only.
    expect(
      state({
        request: booked,
        application: { status: AppStatus.REJECTED },
        scrim: { guestTeamId: "winner", status: ScrimStatus.SCHEDULED },
      }),
    ).toEqual({ exists: true, writable: false });
  });

  it("is closed when either team is banned or dissolved", () => {
    expect(state({ host: { bannedAt: NOW, dissolvedAt: null } }).writable).toBe(false);
    expect(state({ guest: { bannedAt: null, dissolvedAt: NOW } }).writable).toBe(false);
  });
});

describe("sendMessage and the notification", () => {
  it("lets every member of both teams write, unverified members too", async () => {
    const { host, guest, key } = await applied();
    await send(guest.members[0]!, guest, key, "  Hallo!  ");
    await send(host.members[0]!, host, key, "Hi zurück\nbis später");
    const shown = await view(host.captain, host, key);
    expect(shown.messages.map((message) => message.body)).toEqual([
      "Hallo!",
      "Hi zurück\nbis später",
    ]);
    expect(shown).toMatchObject({ side: "HOST", writable: true, otherTeam: { id: guest.team.id } });
    expect(shown.messages[0]).toMatchObject({
      authorName: guest.members[0]!.name,
      teamName: guest.team.name,
      own: false,
      mine: false,
      reported: false,
    });
    expect(shown.messages[1]).toMatchObject({ own: true, mine: false });
  });

  it("notifies the other team once until someone of it has read", async () => {
    const { host, guest, key, request } = await applied();
    await send(guest.captain, guest, key, "eins");
    await send(guest.members[0]!, guest, key, "zwei", new Date(NOW.getTime() + MINUTE));
    const first = await notificationsTo(host.team.id);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ requestId: request.id, scrimId: null });
    expect(first[0]!.payload).toEqual({
      teamName: guest.team.name,
      startsAt: REQUEST_STARTS_AT.toISOString(),
      context: "APPLICATION",
      guestTeamId: guest.team.id,
      toGuest: false,
    });
    const firstMessage = await prisma.message.findFirstOrThrow({
      where: { body: "eins", authorId: guest.captain.id },
    });
    expect(first[0]!.dedupeKey).toBe(
      `MESSAGE_RECEIVED:${firstMessage.id}:${host.team.id}:${NotifChannel.PERSONAL}`,
    );
    // Never the own team.
    expect(await notificationsTo(guest.team.id)).toHaveLength(0);

    // A member of the host team reads: the next message notifies again.
    await read(host.members[0]!, host, key, new Date(NOW.getTime() + 2 * MINUTE));
    await send(guest.captain, guest, key, "drei", new Date(NOW.getTime() + 3 * MINUTE));
    expect(await notificationsTo(host.team.id)).toHaveLength(2);
  });

  it("notifies the guest for the host's first message, and whoever writes has read", async () => {
    const { host, guest, key } = await applied();
    await send(guest.captain, guest, key, "Frage");
    await send(host.captain, host, key, "Antwort", new Date(NOW.getTime() + MINUTE));
    expect(await notificationsTo(guest.team.id)).toHaveLength(1);
    // Writing counted as reading for the host: the guest's next message notifies again.
    await send(guest.captain, guest, key, "Danke", new Date(NOW.getTime() + 2 * MINUTE));
    expect(await notificationsTo(host.team.id)).toHaveLength(2);
  });

  it("keeps out other teams and teams without an application", async () => {
    const { host, key, request } = await applied();
    const outsider = await team();
    await expect(
      sendMessage({
        userId: outsider.captain.id,
        teamId: outsider.team.id,
        ...key,
        body: "x",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", text: { key: "conversationNotFound" } });
    // The host team's ID without being a member of it.
    await expect(
      sendMessage({
        userId: outsider.captain.id,
        teamId: host.team.id,
        ...key,
        body: "x",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", text: { key: "notInTeam" } });
    // A thread with a team that never applied does not exist.
    await expect(
      sendMessage({
        userId: host.captain.id,
        teamId: host.team.id,
        requestId: request.id,
        guestTeamId: outsider.team.id,
        body: "x",
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", text: { key: "conversationNotFound" } });
    await expect(view(outsider.captain, outsider, key)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("checks the text", async () => {
    const { guest, key } = await applied();
    await expect(send(guest.captain, guest, key, "   ")).rejects.toMatchObject({
      code: "INVALID",
      text: { key: "messageEmpty" },
    });
    await expect(send(guest.captain, guest, key, "x".repeat(1001))).rejects.toMatchObject({
      code: "INVALID",
      text: { key: "messageBodyTooLong" },
    });
    await send(guest.captain, guest, key, "x".repeat(1000));
  });

  it("closes the thread when the application is withdrawn, rejected or the request expires", async () => {
    const withdrawn = await applied();
    await send(withdrawn.guest.captain, withdrawn.guest, withdrawn.key, "vorher");
    await withdrawApplication({
      userId: withdrawn.guest.captain.id,
      applicationId: withdrawn.application.id,
      now: NOW,
    });
    await expect(send(withdrawn.host.captain, withdrawn.host, withdrawn.key)).rejects.toMatchObject(
      {
        code: "CONFLICT",
        text: { key: "conversationClosed" },
      },
    );
    // Still readable.
    const shown = await view(withdrawn.host.captain, withdrawn.host, withdrawn.key);
    expect(shown).toMatchObject({ writable: false });
    expect(shown.messages).toHaveLength(1);

    const expired = await applied();
    await expect(
      send(expired.guest.captain, expired.guest, expired.key, "zu spät", REQUEST_STARTS_AT),
    ).rejects.toMatchObject({ text: { key: "conversationClosed" } });

    // Another applicant is confirmed: the rejected applicant's thread is read only.
    const booked = await applied();
    const other = await team();
    await applyToRequest({
      userId: other.captain.id,
      teamId: other.team.id,
      requestId: booked.request.id,
      now: NOW,
    });
    await bookFrom(booked);
    const rejected = { requestId: booked.request.id, guestTeamId: other.team.id };
    await expect(send(other.captain, other, rejected)).rejects.toMatchObject({
      text: { key: "conversationClosed" },
    });
  });

  it("refuses banned users and closes when a team is banned", async () => {
    const { host, guest, key } = await applied();
    const member = guest.members[0]!;
    await banUser({ adminId: admin.id, userId: member.id, uploadDir: tmpdir(), now: NOW });
    await expect(send(member, guest, key)).rejects.toMatchObject({ code: "BANNED" });
    await banTeam({ adminId: admin.id, teamId: host.team.id, now: NOW });
    await expect(send(guest.captain, guest, key)).rejects.toMatchObject({
      text: { key: "conversationClosed" },
    });
    // The banned team's members still read.
    expect((await view(host.captain, host, key)).writable).toBe(false);
  });

  it("forgets former members", async () => {
    const { guest, key } = await applied();
    const member = guest.members[0]!;
    await send(member, guest, key, "bin gleich weg");
    await leaveTeam({ userId: member.id, teamId: guest.team.id, now: NOW });
    await expect(view(member, guest, key)).rejects.toMatchObject({ text: { key: "notInTeam" } });
  });
});

describe("the thread after booking", () => {
  it("continues on the scrim page and closes with the evaluation", async () => {
    const setup = await applied();
    const { host, guest, key } = setup;
    await send(guest.captain, guest, key, "vor der Buchung");
    const scrim = await bookFrom(setup);
    await send(host.captain, host, key, "nach der Buchung", new Date(NOW.getTime() + MINUTE));

    const detail = await getScrimDetail({
      userId: guest.members[0]!.id,
      scrimId: scrim.id,
      now: NOW,
    });
    expect(detail?.conversation?.messages.map((message) => message.body)).toEqual([
      "vor der Buchung",
      "nach der Buchung",
    ]);
    expect(detail?.conversation).toMatchObject({ side: "GUEST", writable: true });
    const [toGuest] = await notificationsTo(guest.team.id);
    expect(toGuest).toMatchObject({ scrimId: scrim.id });
    expect(toGuest!.payload).toMatchObject({ context: "SCRIM" });

    // Feedback time still takes messages; the evaluated scrim does not.
    const afterStart = new Date(REQUEST_STARTS_AT.getTime() + 4 * HOUR);
    await openFeedback(afterStart);
    await send(guest.captain, guest, key, "gg", afterStart);
    for (const side of [host, guest]) {
      await submitFeedback({
        userId: side.captain.id,
        teamId: side.team.id,
        scrimId: scrim.id,
        outcome: "PLAYED",
        rating: 5,
        now: afterStart,
      });
    }
    await expect(send(guest.captain, guest, key, "noch was", afterStart)).rejects.toMatchObject({
      text: { key: "conversationClosed" },
    });
  });

  it("closes when the scrim is cancelled", async () => {
    const setup = await applied();
    const scrim = await bookFrom(setup);
    await cancelScrim({
      userId: setup.host.captain.id,
      teamId: setup.host.team.id,
      scrimId: scrim.id,
      now: NOW,
    });
    await expect(send(setup.guest.captain, setup.guest, setup.key)).rejects.toMatchObject({
      text: { key: "conversationClosed" },
    });
  });
});

describe("direct requests", () => {
  async function direct() {
    const a = await team();
    const b = await team();
    const request = await createRequest({
      ...REQUEST_INPUT,
      userId: a.captain.id,
      teamId: a.team.id,
      targetTeamId: b.team.id,
      now: NOW,
    });
    return { a, b, request, key: { requestId: request.id, guestTeamId: b.team.id } };
  }

  it("has one thread for both teams, open until declined", async () => {
    const { a, b, request, key } = await direct();
    await send(b.members[0]!, b, key, "Passt 20 Uhr?");
    const [toA] = await notificationsTo(a.team.id);
    expect(toA!.payload).toMatchObject({ context: "DIRECT", guestTeamId: b.team.id });
    const detail = await getRequestDetail({
      userId: a.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(detail?.conversation?.messages).toHaveLength(1);
    expect(detail?.conversation?.side).toBe("HOST");
    const target = await getRequestDetail({
      userId: b.captain.id,
      requestId: request.id,
      now: NOW,
    });
    expect(target?.conversation?.side).toBe("GUEST");

    await declineDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW });
    await expect(send(a.captain, a, key)).rejects.toMatchObject({
      text: { key: "conversationClosed" },
    });
  });

  it("gives every date of a fixed partnership its own thread", async () => {
    const a = await createTeamWithMembers({ extraMembers: 1 });
    const b = await createTeamWithMembers({ extraMembers: 1 });
    const request = await createRequest({
      ...REQUEST_INPUT,
      repeatUntil: "2026-11-05",
      userId: a.captain.id,
      teamId: a.team.id,
      targetTeamId: b.team.id,
      now: NOW,
    });
    await acceptDirectRequest({ userId: b.captain.id, requestId: request.id, now: NOW });
    const { seriesId } = await prisma.scrimRequest.findUniqueOrThrow({ where: { id: request.id } });
    seriesIds.push(seriesId!);
    await send(a.captain, a, { requestId: request.id, guestTeamId: b.team.id }, "erste Woche");
    await postSeriesRequests(REQUEST_STARTS_AT);
    const next = await prisma.scrim.findFirstOrThrow({
      where: { request: { seriesId }, requestId: { not: request.id } },
    });
    const detail = await getScrimDetail({ userId: b.captain.id, scrimId: next.id, now: NOW });
    expect(detail?.conversation).toMatchObject({ messages: [], writable: true });
  });
});

describe("read state and markers", () => {
  it("marks the first unread message and the cards of Meine Scrims", async () => {
    const { host, guest, key, request } = await applied();
    await send(guest.captain, guest, key, "alt");
    await read(host.captain, host, key, new Date(NOW.getTime() + MINUTE));
    await send(guest.captain, guest, key, "neu", new Date(NOW.getTime() + 2 * MINUTE));
    const shown = await view(host.captain, host, key);
    expect(shown.messages.find((message) => message.id === shown.firstUnreadId)?.body).toBe("neu");
    // Per person: the other host member has read nothing.
    const other = await view(host.members[0]!, host, key);
    expect(other.messages.find((message) => message.id === other.firstUnreadId)?.body).toBe("alt");

    const hostScrims = await getMyScrims({ userId: host.captain.id, now: NOW });
    expect(hostScrims.requests.find((entry) => entry.id === request.id)?.unread).toBe(true);
    const guestScrims = await getMyScrims({ userId: guest.captain.id, now: NOW });
    expect(guestScrims.applications.find((entry) => entry.requestId === request.id)?.unread).toBe(
      false,
    );

    const detail = await getRequestDetail({
      userId: host.captain.id,
      requestId: request.id,
      now: NOW,
    });
    const application = detail?.applications?.find((entry) => entry.team.id === guest.team.id);
    expect(application?.conversation?.messages).toHaveLength(2);
    expect(application?.conversation?.firstUnreadId).not.toBeNull();
    expect(detail?.conversation).toBeNull();

    await read(host.captain, host, key, new Date(NOW.getTime() + 3 * MINUTE));
    expect((await view(host.captain, host, key)).firstUnreadId).toBeNull();
    const after = await getMyScrims({ userId: host.captain.id, now: NOW });
    expect(after.requests.find((entry) => entry.id === request.id)?.unread).toBe(false);
  });

  it("does nothing before the first message", async () => {
    const { host, key } = await applied();
    await read(host.captain, host, key);
    expect(await prisma.conversation.count({ where: key })).toBe(0);
  });
});

describe("deleting and reporting", () => {
  it("lets only the author delete, also in a closed thread", async () => {
    const setup = await applied();
    const { host, guest, key } = setup;
    await send(guest.captain, guest, key, "ups");
    const message = await prisma.message.findFirstOrThrow({
      where: { body: "ups", authorId: guest.captain.id },
    });
    await expect(
      deleteOwnMessage({ userId: guest.members[0]!.id, messageId: message.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", text: { key: "messageNotFound" } });
    await expect(
      deleteOwnMessage({ userId: host.captain.id, messageId: message.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await withdrawApplication({
      userId: guest.captain.id,
      applicationId: setup.application.id,
      now: NOW,
    });
    expect(await deleteOwnMessage({ userId: guest.captain.id, messageId: message.id })).toEqual(
      key,
    );
    expect(await prisma.message.count({ where: { id: message.id } })).toBe(0);
    await expect(
      deleteOwnMessage({ userId: guest.captain.id, messageId: message.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets the other team report once, and the reports go with a deleted message", async () => {
    const { host, guest, key } = await applied();
    await send(guest.captain, guest, key, "unfreundlich");
    const message = await prisma.message.findFirstOrThrow({
      where: { body: "unfreundlich", authorId: guest.captain.id },
    });
    const report = (user: { id: string }, teamOf: Team) =>
      reportMessage({ userId: user.id, teamId: teamOf.team.id, messageId: message.id, now: NOW });
    await expect(report(guest.members[0]!, guest)).rejects.toMatchObject({
      code: "INVALID",
      text: { key: "reportOwnTeam" },
    });
    const outsider = await team();
    await expect(report(outsider.captain, outsider)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await report(host.members[0]!, host)).toEqual(key);
    await expect(report(host.captain, host)).rejects.toMatchObject({
      code: "CONFLICT",
      text: { key: "alreadyReported" },
    });
    expect((await view(host.captain, host, key)).messages[0]?.reported).toBe(true);
    expect((await view(guest.captain, guest, key)).messages[0]?.reported).toBe(false);

    await deleteOwnMessage({ userId: guest.captain.id, messageId: message.id });
    expect(await prisma.messageReport.count({ where: { messageId: message.id } })).toBe(0);
    await expect(report(host.captain, host)).rejects.toMatchObject({
      text: { key: "messageNotFound" },
    });
  });
});

describe("moderation", () => {
  async function reported(body: string) {
    const { host, guest, key } = await applied();
    await send(guest.captain, guest, key, body);
    const message = await prisma.message.findFirstOrThrow({
      where: { body, authorId: guest.captain.id },
    });
    await reportMessage({
      userId: host.captain.id,
      teamId: host.team.id,
      messageId: message.id,
      now: NOW,
    });
    return { host, guest, key, message };
  }

  it("shows admins only reported messages, and they remove or dismiss them", async () => {
    const removed = await reported("weg damit");
    const kept = await reported("harmlos");
    const { guest, key } = await applied();
    await send(guest.captain, guest, key, "nicht gemeldet");

    const list = await listMessageReports(admin.id);
    const ids = list.map((entry) => entry.id);
    expect(ids).toContain(removed.message.id);
    expect(ids).toContain(kept.message.id);
    expect(list.map((entry) => entry.body)).not.toContain("nicht gemeldet");
    const entry = list.find((item) => item.id === removed.message.id)!;
    expect(entry).toMatchObject({
      body: "weg damit",
      author: { id: removed.guest.captain.id, discordId: removed.guest.captain.discordId },
      team: { id: removed.guest.team.id },
      otherTeam: { id: removed.host.team.id },
      startsAt: REQUEST_STARTS_AT,
      reports: [{ team: { id: removed.host.team.id } }],
    });
    const before = (await getAdminOverview({ staffId: admin.id, now: NOW })).messageReports;
    expect(before).toBeGreaterThanOrEqual(2);

    expect(
      await removeReportedMessage({ adminId: admin.id, messageId: removed.message.id }),
    ).toEqual(removed.key);
    expect(await prisma.message.count({ where: { id: removed.message.id } })).toBe(0);
    await dismissMessageReports({ adminId: admin.id, messageId: kept.message.id, now: NOW });
    const after = (await listMessageReports(admin.id)).map((item) => item.id);
    expect(after).not.toContain(removed.message.id);
    expect(after).not.toContain(kept.message.id);
    expect((await getAdminOverview({ staffId: admin.id, now: NOW })).messageReports).toBe(
      before! - 2,
    );
    // Dismissed: the same team cannot report it again, the message stays.
    await expect(
      reportMessage({
        userId: kept.host.members[0]!.id,
        teamId: kept.host.team.id,
        messageId: kept.message.id,
        now: NOW,
      }),
    ).rejects.toMatchObject({ text: { key: "alreadyReported" } });
    expect(await prisma.message.count({ where: { id: kept.message.id } })).toBe(1);
  });

  it("is for admins with 2FA only", async () => {
    const { message } = await reported("Rechte");
    const reviewer = await createUser({ verified: true, staffRole: StaffRole.REVIEWER });
    const noTwoFactor = await createUser({ staffRole: StaffRole.ADMIN, twoFactor: false });
    for (const user of [reviewer, noTwoFactor]) {
      await expect(listMessageReports(user.id)).rejects.toBeDefined();
      await expect(
        removeReportedMessage({ adminId: user.id, messageId: message.id }),
      ).rejects.toBeDefined();
      await expect(
        dismissMessageReports({ adminId: user.id, messageId: message.id, now: NOW }),
      ).rejects.toBeDefined();
    }
    expect((await getAdminOverview({ staffId: reviewer.id, now: NOW })).messageReports).toBeNull();
  });
});

describe("retention, account deletion and the export", () => {
  it("purges threads 30 days after their start, not earlier", async () => {
    const { guest, key } = await applied();
    await send(guest.captain, guest, key, "alt genug");
    const message = await prisma.message.findFirstOrThrow({
      where: { body: "alt genug", authorId: guest.captain.id },
    });
    await purgeOldConversations(new Date(REQUEST_STARTS_AT.getTime() + 30 * DAY));
    expect(await prisma.conversation.count({ where: key })).toBe(1);
    await purgeOldConversations(new Date(REQUEST_STARTS_AT.getTime() + 30 * DAY + 1));
    expect(await prisma.conversation.count({ where: key })).toBe(0);
    expect(await prisma.message.count({ where: { id: message.id } })).toBe(0);
  });

  it("deletes the author's messages and read state, keeps the others", async () => {
    const { host, guest, key } = await applied();
    const member = guest.members[0]!;
    await send(member, guest, key, "von mir");
    await send(host.captain, host, key, "von dir", new Date(NOW.getTime() + MINUTE));
    const message = await prisma.message.findFirstOrThrow({
      where: { body: "von mir", authorId: member.id },
    });
    await reportMessage({
      userId: host.captain.id,
      teamId: host.team.id,
      messageId: message.id,
      now: NOW,
    });
    // The member's own report on the host's message stays with the anonymized account.
    const hostMessage = await prisma.message.findFirstOrThrow({
      where: { body: "von dir", authorId: host.captain.id },
    });
    await reportMessage({
      userId: member.id,
      teamId: guest.team.id,
      messageId: hostMessage.id,
      now: NOW,
    });

    const { conversations } = await deleteAccount({
      userId: member.id,
      uploadDir: tmpdir(),
      now: NOW,
    });
    expect(conversations).toEqual([key]);
    expect(await prisma.message.count({ where: { authorId: member.id } })).toBe(0);
    expect(await prisma.conversationRead.count({ where: { userId: member.id } })).toBe(0);
    expect(await prisma.messageReport.count({ where: { messageId: message.id } })).toBe(0);
    expect(await prisma.messageReport.count({ where: { reportedById: member.id } })).toBe(1);
    expect((await view(host.captain, host, key)).messages.map((entry) => entry.body)).toEqual([
      "von dir",
    ]);
  });

  it("exports the own messages, reports and read state, but not the others' text", async () => {
    const { host, guest, key } = await applied();
    await send(guest.captain, guest, key, "meins");
    await send(host.captain, host, key, "fremder Text", new Date(NOW.getTime() + MINUTE));
    const hostMessage = await prisma.message.findFirstOrThrow({
      where: { body: "fremder Text", authorId: host.captain.id },
    });
    await reportMessage({
      userId: guest.captain.id,
      teamId: guest.team.id,
      messageId: hostMessage.id,
      now: NOW,
    });
    const data = await exportAccountData({
      userId: guest.captain.id,
      now: NOW,
      privacyPolicyUrl: "https://example.org/datenschutz",
      uploadDir: tmpdir(),
    });
    expect(data.teamNachrichten).toEqual([
      {
        team: guest.team.name,
        anderesTeam: host.team.name,
        terminAm: REQUEST_STARTS_AT,
        geschriebenAm: NOW,
        text: "meins",
      },
    ]);
    expect(data.gemeldeteNachrichten).toEqual([
      {
        team: guest.team.name,
        anderesTeam: host.team.name,
        terminAm: REQUEST_STARTS_AT,
        gemeldetAm: NOW,
        verworfenAm: null,
      },
    ]);
    expect(data.gelesen).toEqual([
      {
        teams: [host.team.name, guest.team.name],
        terminAm: REQUEST_STARTS_AT,
        zuletztGelesenAm: NOW,
      },
    ]);
    expect(JSON.stringify(data)).not.toContain("fremder Text");

    await dismissMessageReports({ adminId: admin.id, messageId: hostMessage.id, now: NOW });
    const staff = await exportAccountData({
      userId: admin.id,
      now: NOW,
      privacyPolicyUrl: "https://example.org/datenschutz",
      uploadDir: tmpdir(),
    });
    expect(staff.verwaltung.meldungen).toContainEqual({
      entschiedenAm: NOW,
      ergebnis: "Meldung verworfen",
    });
  });
});
