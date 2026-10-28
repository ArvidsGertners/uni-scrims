// Messages between the two teams of a request (SPEC N-28, ARCHITECTURE §5.30). One thread per request
// and guest team: the host is always the request's team, the guest the applicant, the target of a
// direct request or the scrim's guest, so the thread of an application or direct request is the
// scrim's after booking. All members of both teams read and write; a notification carries no text and
// comes again only after the other side has read. Writers lock the user row, then the thread (§4).
import {
  AppStatus,
  NotifChannel,
  NotifType,
  type Prisma,
  type RequestStatus,
  ScrimStatus,
  prisma,
} from "@uni-scrims/db";
import { MESSAGE_RETENTION_DAYS } from "../config/limits.ts";
import { type Db, isForeignKeyViolation, isUniqueViolation } from "./db.ts";
import { DomainError } from "./errors.ts";
import { markMessageItemsRead } from "./inbox.ts";
import { lockConversation, lockUser } from "./locks.ts";
import { type MessageContext, queueNotifications } from "./notifications.ts";
import { requireAdmin, requireTeamMember, requireUser } from "./permissions.ts";
import { isTeamActive } from "./readiness.ts";
import { isRequestOpen } from "./requests.ts";
import { messageBodySchema, parseInput } from "./schemas.ts";
import { DISCORD_PROVIDER } from "./users.ts";

const DAY = 24 * 60 * 60 * 1000;

/** A thread: the request and its guest team (§5.30). */
export type ConversationKey = { requestId: string; guestTeamId: string };

/** The key as one string, for maps and the WebSocket subscriptions (cuids have no colon). */
export function conversationKeyOf(key: ConversationKey): string {
  return `${key.requestId}:${key.guestTeamId}`;
}

/** Which side of the thread a team is on. */
export type ConversationSide = "HOST" | "GUEST";

type TeamState = { bannedAt: Date | null; dissolvedAt: Date | null };

/** A scrim can still be talked about until its feedback is evaluated (SPEC N-28). */
const OPEN_SCRIM_STATUSES: readonly ScrimStatus[] = [
  ScrimStatus.SCHEDULED,
  ScrimStatus.AWAITING_FEEDBACK,
];

export type ConversationStateInput = {
  request: {
    teamId: string;
    targetTeamId: string | null;
    status: RequestStatus;
    startsAt: Date;
  };
  host: TeamState;
  guest: TeamState;
  guestTeamId: string;
  /** The guest team's application to a board request, if any. */
  application: { status: AppStatus } | null;
  /** The scrim booked from the request, with whichever team. */
  scrim: { guestTeamId: string; status: ScrimStatus } | null;
};

/**
 * Whether the thread exists and whether it takes messages (§5.30). It exists for the scrim's guest,
 * the target of a direct request and every team that applied to a board request. It takes messages
 * while both teams are active and the scrim is scheduled or awaits feedback, or, before a booking,
 * the request is open and, for a board request, the application is pending.
 */
export function conversationState(
  input: ConversationStateInput,
  now: Date,
): { exists: boolean; writable: boolean } {
  const { request, scrim, application, guestTeamId } = input;
  const booked = scrim?.guestTeamId === guestTeamId;
  const exists =
    guestTeamId !== request.teamId &&
    (booked ||
      request.targetTeamId === guestTeamId ||
      (request.targetTeamId === null && application !== null));
  if (!exists) return { exists: false, writable: false };
  const open = booked
    ? OPEN_SCRIM_STATUSES.includes(scrim.status)
    : scrim === null &&
      isRequestOpen(request, now) &&
      (request.targetTeamId !== null || application?.status === AppStatus.PENDING);
  return { exists: true, writable: open && isTeamActive(input.host) && isTeamActive(input.guest) };
}

const threadTeamSelect = {
  id: true,
  name: true,
  bannedAt: true,
  dissolvedAt: true,
} satisfies Prisma.TeamSelect;

/** What the state of the threads of one request needs; sequential queries, also in a transaction. */
async function loadThreadContext(db: Db, requestId: string, guestTeamIds: readonly string[]) {
  const request = await db.scrimRequest.findUnique({
    where: { id: requestId },
    select: { id: true, teamId: true, targetTeamId: true, status: true, startsAt: true },
  });
  if (!request) return null;
  const teams = await db.team.findMany({
    where: { id: { in: [request.teamId, ...guestTeamIds] } },
    select: threadTeamSelect,
  });
  const host = teams.find((team) => team.id === request.teamId);
  if (!host) return null;
  const scrim = await db.scrim.findUnique({
    where: { requestId },
    select: { id: true, guestTeamId: true, status: true },
  });
  const applications =
    request.targetTeamId === null
      ? await db.application.findMany({
          where: { requestId, teamId: { in: [...guestTeamIds] } },
          select: { teamId: true, status: true },
        })
      : [];
  return {
    request,
    host,
    scrim,
    guests: new Map(teams.map((team) => [team.id, team])),
    applications: new Map(applications.map((entry) => [entry.teamId, entry])),
  };
}

type ThreadContext = NonNullable<Awaited<ReturnType<typeof loadThreadContext>>>;

function stateOf(context: ThreadContext, guestTeamId: string, now: Date) {
  const guest = context.guests.get(guestTeamId);
  if (!guest) return { exists: false, writable: false };
  return conversationState(
    {
      request: context.request,
      host: context.host,
      guest,
      guestTeamId,
      application: context.applications.get(guestTeamId) ?? null,
      scrim: context.scrim,
    },
    now,
  );
}

function sideOf(context: ThreadContext, teamId: string, guestTeamId: string) {
  if (teamId === context.request.teamId) return "HOST" as const;
  return teamId === guestTeamId ? ("GUEST" as const) : null;
}

function conversationNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "conversationNotFound");
}

function messageNotFound(): DomainError {
  return new DomainError("NOT_FOUND", "messageNotFound");
}

type AccessInput = ConversationKey & { userId: string; teamId: string; now: Date };

/**
 * A member of one of the thread's teams, for the team the page acted for (§5.20): not banned,
 * complete account, no verification needed; a banned team only reads. Everyone else, and anyone
 * naming a thread that does not exist, gets the same NOT_FOUND (§5.30).
 */
async function requireConversationAccess(db: Db, input: AccessInput) {
  const { user, team } = await requireTeamMember(input.userId, input.teamId, db);
  const context = await loadThreadContext(db, input.requestId, [input.guestTeamId]);
  const side = context ? sideOf(context, team.id, input.guestTeamId) : null;
  if (!context || !side) throw conversationNotFound();
  const state = stateOf(context, input.guestTeamId, input.now);
  if (!state.exists) throw conversationNotFound();
  return { user, team, side, context, state };
}

// ─── Reading ──────────────────────────────────────────────────────────────────

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  teamName: string;
  /** Sent by the team the viewer reads for; shown on the right. */
  own: boolean;
  /** Written by the viewer, who may delete it. */
  mine: boolean;
  /** Reported by the viewer's team. */
  reported: boolean;
};

export type ConversationView = ConversationKey & {
  /** The team the viewer reads and writes for (§5.20). */
  teamId: string;
  side: ConversationSide;
  otherTeam: { id: string; name: string };
  writable: boolean;
  /** When this view was read; the browser keeps the newest one (§5.30). */
  asOf: Date;
  messages: ThreadMessage[];
  /** The first message of the other team after the viewer's read state, or null. */
  firstUnreadId: string | null;
};

/** The views of the threads of `guestTeamIds` the viewer's team is on; threads that do not exist are left out. */
async function loadViews(
  context: ThreadContext,
  viewer: { userId: string; teamId: string },
  guestTeamIds: readonly string[],
  now: Date,
): Promise<ConversationView[]> {
  const shown = guestTeamIds.flatMap((guestTeamId) => {
    const side = sideOf(context, viewer.teamId, guestTeamId);
    const state = stateOf(context, guestTeamId, now);
    return side && state.exists ? [{ guestTeamId, side, writable: state.writable }] : [];
  });
  if (shown.length === 0) return [];
  const conversations = await prisma.conversation.findMany({
    where: {
      requestId: context.request.id,
      guestTeamId: { in: shown.map(({ guestTeamId }) => guestTeamId) },
    },
    select: {
      guestTeamId: true,
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          body: true,
          createdAt: true,
          teamId: true,
          authorId: true,
          author: { select: { name: true } },
          reports: { where: { teamId: viewer.teamId }, select: { id: true } },
        },
      },
      reads: { where: { userId: viewer.userId }, select: { readAt: true } },
    },
  });
  const teamName = (id: string) => context.guests.get(id)?.name ?? "";
  return shown.map(({ guestTeamId, side, writable }) => {
    const conversation = conversations.find((entry) => entry.guestTeamId === guestTeamId);
    const readAt = conversation?.reads[0]?.readAt ?? null;
    const messages = (conversation?.messages ?? []).map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      authorName: message.author.name,
      teamName: teamName(message.teamId),
      own: message.teamId === viewer.teamId,
      mine: message.authorId === viewer.userId,
      reported: message.reports.length > 0,
    }));
    const otherTeamId = side === "HOST" ? guestTeamId : context.request.teamId;
    return {
      requestId: context.request.id,
      guestTeamId,
      teamId: viewer.teamId,
      side,
      otherTeam: { id: otherTeamId, name: teamName(otherTeamId) },
      writable,
      asOf: now,
      messages,
      firstUnreadId:
        messages.find((message) => !message.own && (!readAt || message.createdAt > readAt))?.id ??
        null,
    };
  });
}

/**
 * The threads of a request for the request and scrim pages (§5.30): for the viewer's team, which the
 * caller has checked (findOwnTeam). Without access to a thread it is left out.
 */
export async function conversationViews(input: {
  userId: string;
  teamId: string;
  requestId: string;
  guestTeamIds: readonly string[];
  now: Date;
}): Promise<ConversationView[]> {
  if (input.guestTeamIds.length === 0) return [];
  const context = await loadThreadContext(prisma, input.requestId, input.guestTeamIds);
  if (!context) return [];
  return loadViews(context, input, input.guestTeamIds, input.now);
}

/** One thread with the access check, for the WebSocket server (§5.30). */
export async function getConversation(input: AccessInput): Promise<ConversationView> {
  const { team, context } = await requireConversationAccess(prisma, input);
  const [view] = await loadViews(
    context,
    { userId: input.userId, teamId: team.id },
    [input.guestTeamId],
    input.now,
  );
  if (!view) throw conversationNotFound();
  return view;
}

/**
 * The threads among `requestIds` with messages of the other team after the user's read state, as
 * conversationKeyOf strings; for the "Neu" markers of "Meine Scrims" (§5.30).
 */
export async function unreadConversationKeys(
  db: Db,
  input: { userId: string; teamId: string; requestIds: readonly string[] },
): Promise<Set<string>> {
  if (input.requestIds.length === 0) return new Set();
  const conversations = await db.conversation.findMany({
    where: {
      requestId: { in: [...input.requestIds] },
      OR: [{ guestTeamId: input.teamId }, { request: { teamId: input.teamId } }],
    },
    select: {
      requestId: true,
      guestTeamId: true,
      reads: { where: { userId: input.userId }, select: { readAt: true } },
      messages: {
        where: { teamId: { not: input.teamId } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  return new Set(
    conversations
      .filter((conversation) => {
        const latest = conversation.messages[0]?.createdAt;
        const readAt = conversation.reads[0]?.readAt;
        return latest !== undefined && (!readAt || latest > readAt);
      })
      .map(conversationKeyOf),
  );
}

// ─── Writing ──────────────────────────────────────────────────────────────────

/** The viewer's side has read the thread: the person's read state and the side's (§5.30). */
async function markRead(
  tx: Prisma.TransactionClient,
  input: { conversationId: string; userId: string; side: ConversationSide; now: Date },
): Promise<void> {
  await tx.conversation.update({
    where: { id: input.conversationId },
    data: input.side === "HOST" ? { hostReadAt: input.now } : { guestReadAt: input.now },
  });
  await tx.conversationRead.upsert({
    where: {
      conversationId_userId: { conversationId: input.conversationId, userId: input.userId },
    },
    create: { conversationId: input.conversationId, userId: input.userId, readAt: input.now },
    update: { readAt: input.now },
  });
}

/**
 * Sends a message for `teamId`, the team the page acted for (§5.20, §5.30). The user row first, so
 * a ban or an account deletion either comes before (and this fails) or waits and sees the message;
 * then the thread, so two messages decide about the notification one after the other.
 */
export async function sendMessage(
  input: AccessInput & { body: string | null | undefined },
): Promise<ConversationKey> {
  const body = parseInput(messageBodySchema, input.body);
  const key = { requestId: input.requestId, guestTeamId: input.guestTeamId };
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const { user, team, side, context, state } = await requireConversationAccess(tx, input);
    if (!state.writable) throw new DomainError("CONFLICT", "conversationClosed");
    // The thread appears with its first message; a parallel first message waits on the index.
    await tx.conversation.createMany({
      data: [{ ...key, createdAt: input.now }],
      skipDuplicates: true,
    });
    const { id } = await tx.conversation.findUniqueOrThrow({
      where: { requestId_guestTeamId: key },
      select: { id: true },
    });
    await lockConversation(tx, id);
    const conversation = await tx.conversation.findUniqueOrThrow({ where: { id } });
    const message = await tx.message.create({
      data: {
        conversationId: id,
        teamId: team.id,
        authorId: user.id,
        body,
        createdAt: input.now,
      },
      select: { id: true },
    });
    // Whoever writes has read the thread.
    await markRead(tx, { conversationId: id, userId: user.id, side, now: input.now });

    // The other side gets a notification only if it has read since the last one (SPEC N-28).
    const otherIsHost = side === "GUEST";
    const notifiedAt = otherIsHost ? conversation.hostNotifiedAt : conversation.guestNotifiedAt;
    const readAt = otherIsHost ? conversation.hostReadAt : conversation.guestReadAt;
    if (notifiedAt === null || (readAt !== null && readAt >= notifiedAt)) {
      const booked = context.scrim?.guestTeamId === key.guestTeamId ? context.scrim : null;
      const messageContext: MessageContext = booked
        ? "SCRIM"
        : context.request.targetTeamId !== null
          ? "DIRECT"
          : "APPLICATION";
      await queueNotifications(tx, input.now, [
        {
          type: NotifType.MESSAGE_RECEIVED,
          channel: NotifChannel.PERSONAL,
          entityId: message.id,
          targetTeamId: otherIsHost ? context.request.teamId : key.guestTeamId,
          requestId: context.request.id,
          scrimId: booked?.id,
          payload: {
            teamName: team.name,
            startsAt: context.request.startsAt.toISOString(),
            context: messageContext,
            guestTeamId: key.guestTeamId,
            toGuest: !otherIsHost,
          },
        },
      ]);
      await tx.conversation.update({
        where: { id },
        data: otherIsHost ? { hostNotifiedAt: input.now } : { guestNotifiedAt: input.now },
      });
    }
    return key;
  });
}

/**
 * The open thread was seen (§5.30): the person's read state and the side's, so the next message
 * notifies this team again. Nothing before the first message.
 */
export async function markConversationRead(input: AccessInput): Promise<{ inboxChanged: boolean }> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const { user, side } = await requireConversationAccess(tx, input);
    const conversation = await tx.conversation.findUnique({
      where: {
        requestId_guestTeamId: { requestId: input.requestId, guestTeamId: input.guestTeamId },
      },
      select: { id: true },
    });
    if (!conversation) return { inboxChanged: false };
    await lockConversation(tx, conversation.id);
    await markRead(tx, { conversationId: conversation.id, userId: user.id, side, now: input.now });
    // Its "Neue Nachricht" entries in the bell are read with it (SPEC N-32).
    const inboxChanged = await markMessageItemsRead(tx, { ...input, userId: user.id });
    return { inboxChanged };
  });
}

const messageKeySelect = {
  conversation: { select: { requestId: true, guestTeamId: true } },
} satisfies Prisma.MessageSelect;

/**
 * The author deletes a message, also in a closed thread, while still a member of the team it was
 * written for (SPEC N-28). Its reports go with it (cascade).
 */
export async function deleteOwnMessage(input: {
  userId: string;
  messageId: string;
}): Promise<ConversationKey> {
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: { authorId: true, teamId: true, ...messageKeySelect },
  });
  if (!message || message.authorId !== input.userId) throw messageNotFound();
  // Not banned, complete account; a former member learns as little as a stranger (§5.30).
  const user = await requireUser(input.userId);
  const membership = await prisma.teamMember.findFirst({
    where: { teamId: message.teamId, userId: user.id, team: { dissolvedAt: null } },
    select: { userId: true },
  });
  if (!membership) throw messageNotFound();
  const deleted = await prisma.message.deleteMany({
    where: { id: input.messageId, authorId: input.userId },
  });
  if (deleted.count === 0) throw messageNotFound();
  return message.conversation;
}

/** A member of the other team reports a message, once per team (SPEC N-28). */
export async function reportMessage(input: {
  userId: string;
  teamId: string;
  messageId: string;
  now: Date;
}): Promise<ConversationKey> {
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: { teamId: true, ...messageKeySelect },
  });
  if (!message) throw messageNotFound();
  const key = message.conversation;
  const { user, team } = await requireConversationAccess(prisma, { ...input, ...key });
  if (message.teamId === team.id) throw new DomainError("INVALID", "reportOwnTeam");
  const existing = await prisma.messageReport.findUnique({
    where: { messageId_teamId: { messageId: input.messageId, teamId: team.id } },
    select: { id: true },
  });
  if (existing) throw alreadyReported();
  try {
    await prisma.messageReport.create({
      data: {
        messageId: input.messageId,
        teamId: team.id,
        reportedById: user.id,
        createdAt: input.now,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyReported();
    // Deleted meanwhile: the foreign key fails.
    if (isForeignKeyViolation(error)) throw messageNotFound();
    throw error;
  }
  return key;
}

function alreadyReported(): DomainError {
  return new DomainError("CONFLICT", "alreadyReported");
}

// ─── Moderation ───────────────────────────────────────────────────────────────

/**
 * Reported messages for the admin page "Meldungen" (SPEC N-28): only messages with an open report,
 * the oldest open report first; never the rest of the thread.
 */
export async function listMessageReports(adminId: string) {
  await requireAdmin(adminId);
  const messages = await prisma.message.findMany({
    where: { reports: { some: { dismissedAt: null } } },
    select: {
      id: true,
      body: true,
      createdAt: true,
      teamId: true,
      team: { select: { id: true, name: true } },
      author: { select: { id: true, name: true } },
      conversation: {
        select: {
          guestTeam: { select: { id: true, name: true } },
          request: { select: { startsAt: true, team: { select: { id: true, name: true } } } },
        },
      },
      reports: {
        where: { dismissedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, team: { select: { id: true, name: true } } },
      },
    },
  });
  // The authors' Discord IDs in one query, for the search on the ban page.
  const discordAccounts = await prisma.account.findMany({
    where: {
      providerId: DISCORD_PROVIDER,
      userId: { in: messages.map((message) => message.author.id) },
    },
    select: { userId: true, accountId: true },
  });
  const discordIds = new Map(discordAccounts.map((entry) => [entry.userId, entry.accountId]));
  const entries = messages.map((message) => {
    const { request, guestTeam } = message.conversation;
    return {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      author: {
        id: message.author.id,
        name: message.author.name,
        discordId: discordIds.get(message.author.id) ?? null,
      },
      team: message.team,
      otherTeam: message.teamId === request.team.id ? guestTeam : request.team,
      startsAt: request.startsAt,
      reports: message.reports.map((report) => ({
        id: report.id,
        createdAt: report.createdAt,
        team: report.team,
      })),
    };
  });
  return entries.sort(
    (a, b) => (a.reports[0]?.createdAt.getTime() ?? 0) - (b.reports[0]?.createdAt.getTime() ?? 0),
  );
}

/** An admin removes a reported message (SPEC N-28); its reports go with it. */
export async function removeReportedMessage(input: {
  adminId: string;
  messageId: string;
}): Promise<ConversationKey> {
  await requireAdmin(input.adminId);
  const message = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: messageKeySelect,
  });
  if (!message) throw messageNotFound();
  const deleted = await prisma.message.deleteMany({ where: { id: input.messageId } });
  if (deleted.count === 0) throw messageNotFound();
  return message.conversation;
}

/** An admin dismisses the open reports of a message; the same teams cannot report it again. */
export async function dismissMessageReports(input: {
  adminId: string;
  messageId: string;
  now: Date;
}): Promise<void> {
  const admin = await requireAdmin(input.adminId);
  const dismissed = await prisma.messageReport.updateMany({
    where: { messageId: input.messageId, dismissedAt: null },
    data: { dismissedAt: input.now, dismissedById: admin.id },
  });
  if (dismissed.count === 0) throw messageNotFound();
}

// ─── Retention ────────────────────────────────────────────────────────────────

/**
 * Sweeper step 9 (§6.3): threads whose request started more than MESSAGE_RETENTION_DAYS ago, with
 * their messages, read states and reports (cascade). None of them takes messages anymore.
 */
export async function purgeOldConversations(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - MESSAGE_RETENTION_DAYS * DAY);
  const { count } = await prisma.conversation.deleteMany({
    where: { request: { startsAt: { lt: cutoff } } },
  });
  return count;
}
