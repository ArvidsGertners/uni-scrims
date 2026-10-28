// WebSocket server of the message threads (ARCHITECTURE §5.30) and the notification bell (§5.34), in
// the web process on a port of its own: Next.js does not accept WebSocket upgrades itself. It only
// pushes; messages are written by server actions. Every push is a fresh snapshot, read with the
// subscriber's own rights.
import type { EventEmitter } from "node:events";
import { type IncomingHttpHeaders, type IncomingMessage, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { onConversationChange, onInboxChange } from "./bus.ts";
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_CONNECTIONS_PER_USER,
  MAX_SUBSCRIPTIONS,
  REALTIME_PATH,
  type ServerMessage,
  type Subscription,
  type WireConversation,
  type WireInboxState,
  clientMessageSchema,
  subscriptionKey,
} from "./protocol.ts";

export const HEARTBEAT_MS = 30_000;
/** How often the bell's counts are read: the bot writes the entries in its own process. */
export const INBOX_POLL_MS = 4000;

export type RealtimeDeps = {
  /** The user of the session in these handshake headers, or null. */
  sessionUserId: (headers: Headers) => Promise<string | null>;
  /** The thread as the user may see it now, or null without access. */
  snapshot: (input: Subscription & { userId: string }) => Promise<WireConversation | null>;
  bus: EventEmitter;
  /**
   * The only Origins a browser may connect from, against cross-site use: BETTER_AUTH_URL and, for
   * the bell in the admin area (Phase 37, §5.35), ADMIN_URL.
   */
  origins: string[];
  /** The bell of these users, in one query; a missing user has no unread entries. */
  inboxStates: (userIds: string[]) => Promise<Map<string, WireInboxState>>;
  heartbeatMs?: number;
  inboxPollMs?: number;
};

type Connection = {
  socket: WebSocket;
  userId: string;
  /** Only the cookie, to check the session again in the heartbeat. */
  headers: Headers;
  subscriptions: Map<string, Subscription>;
  alive: boolean;
  /** Pushes of one connection in order, so an older snapshot never overtakes a newer one. */
  queue: Promise<void>;
  /** The bell follows the count over this connection. */
  inbox: boolean;
  /** The last state sent to the bell, to send only changes. */
  lastInbox: string | null;
};

function originOf(value: string | undefined): string | null {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

function cookieHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  if (headers.cookie) result.set("cookie", headers.cookie);
  return result;
}

function reject(socket: Duplex, status: number, text: string): void {
  if (!socket.destroyed) {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }
  socket.destroy();
}

export function createRealtimeServer(deps: RealtimeDeps) {
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  const inboxPollMs = deps.inboxPollMs ?? INBOX_POLL_MS;
  const allowedOrigins = new Set(deps.origins.flatMap((origin) => originOf(origin) ?? []));
  const connections = new Set<Connection>();
  const http = createServer((_request, response) => {
    response.writeHead(426, { "Content-Type": "text/plain" }).end("WebSocket only");
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES });
  const stopping = new AbortController();

  const send = (connection: Connection, message: ServerMessage) => {
    if (connection.socket.readyState === connection.socket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  };

  /** Reads the thread for this subscriber and sends it, or drops the subscription. */
  const push = (connection: Connection, key: string) => {
    connection.queue = connection.queue.then(async () => {
      const subscription = connection.subscriptions.get(key);
      if (!subscription) return;
      try {
        const conversation = await deps.snapshot({ ...subscription, userId: connection.userId });
        // Unsubscribed while reading.
        if (!connection.subscriptions.has(key)) return;
        if (conversation) {
          send(connection, { type: "snapshot", key, conversation });
        } else {
          connection.subscriptions.delete(key);
          send(connection, { type: "denied", key });
        }
      } catch (error) {
        console.error("Realtime snapshot failed", error);
      }
    });
  };

  /** Sends the bell's state if it differs from the last one this connection got. */
  const sendInbox = (connection: Connection, state: WireInboxState) => {
    const key = `${state.unread}:${state.latest}`;
    if (!connection.inbox || connection.lastInbox === key) return;
    connection.lastInbox = key;
    send(connection, { type: "inbox", ...state });
  };

  /**
   * Bumped by every immediate read of a user's bell: an older read (a poll or an earlier refresh)
   * that answers later must not send its state after the newer one. Dropped with the user's last
   * connection.
   */
  const inboxVersions = new Map<string, number>();
  const inboxVersion = (userId: string) => inboxVersions.get(userId) ?? 0;

  /** Sends a state to every connection of the user that follows the bell; each only on a change. */
  const sendInboxToUser = (userId: string, state: WireInboxState) => {
    for (const connection of connections) {
      if (connection.userId === userId) sendInbox(connection, state);
    }
  };

  /** Reads the bells of these users now, in one query, once for all of their tabs (§5.34). */
  const refreshInboxes = (userIds: string[]) => {
    if (userIds.length === 0) return;
    const versions = new Map(userIds.map((userId) => [userId, inboxVersion(userId) + 1]));
    for (const [userId, version] of versions) inboxVersions.set(userId, version);
    void (async () => {
      try {
        const states = await deps.inboxStates(userIds);
        for (const [userId, version] of versions) {
          const state = states.get(userId);
          // A newer read is under way; it sends.
          if (state && inboxVersion(userId) === version) sendInboxToUser(userId, state);
        }
      } catch (error) {
        console.error("Realtime inbox read failed", error);
      }
    })();
  };
  const refreshInbox = (userId: string) => refreshInboxes([userId]);

  /** The users whose bell follows over at least one connection. */
  const inboxUserIds = () => [
    ...new Set([...connections].filter((entry) => entry.inbox).map((entry) => entry.userId)),
  ];

  const onMessage = (connection: Connection, data: RawData) => {
    let parsed;
    try {
      parsed = clientMessageSchema.safeParse(JSON.parse(data.toString()));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) {
      connection.socket.close(1003, "invalid message");
      return;
    }
    if (parsed.data.type === "inbox") {
      // Repeating the state reads nothing.
      if (connection.inbox === parsed.data.on) return;
      connection.inbox = parsed.data.on;
      connection.lastInbox = null;
      if (connection.inbox) refreshInbox(connection.userId);
      return;
    }
    const { type, ...subscription } = parsed.data;
    const key = subscriptionKey(subscription);
    if (type === "unsubscribe") {
      connection.subscriptions.delete(key);
      return;
    }
    if (!connection.subscriptions.has(key) && connection.subscriptions.size >= MAX_SUBSCRIPTIONS) {
      send(connection, { type: "denied", key });
      return;
    }
    connection.subscriptions.set(key, subscription);
    push(connection, key);
  };

  const accept = (socket: WebSocket, userId: string, headers: Headers) => {
    const connection: Connection = {
      socket,
      userId,
      headers,
      subscriptions: new Map(),
      alive: true,
      queue: Promise.resolve(),
      inbox: false,
      lastInbox: null,
    };
    connections.add(connection);
    socket.on("pong", () => {
      connection.alive = true;
    });
    socket.on("message", (data) => onMessage(connection, data));
    socket.on("close", () => {
      connections.delete(connection);
      if (![...connections].some((entry) => entry.userId === userId)) inboxVersions.delete(userId);
    });
    socket.on("error", () => socket.terminate());
  };

  http.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Node drops its own error handler before "upgrade", and ws adds one only in handleUpgrade: a
    // client that resets the connection while the session is looked up must not crash the process.
    const onSocketError = () => socket.destroy();
    socket.on("error", onSocketError);
    void (async () => {
      try {
        const path = new URL(request.url ?? "/", "http://realtime").pathname;
        if (path !== REALTIME_PATH) return reject(socket, 404, "Not Found");
        const origin = originOf(request.headers.origin);
        if (!origin || !allowedOrigins.has(origin)) {
          return reject(socket, 403, "Forbidden");
        }
        const headers = cookieHeaders(request.headers);
        const userId = await deps.sessionUserId(headers);
        if (!userId) return reject(socket, 401, "Unauthorized");
        const open = [...connections].filter((entry) => entry.userId === userId).length;
        if (open >= MAX_CONNECTIONS_PER_USER) return reject(socket, 429, "Too Many Requests");
        if (socket.destroyed) return;
        socket.off("error", onSocketError);
        wss.handleUpgrade(request, socket, head, (ws) => accept(ws, userId, headers));
      } catch (error) {
        console.error("Realtime handshake failed", error);
        reject(socket, 500, "Internal Server Error");
      }
    })();
  });

  const stopListening = onConversationChange(deps.bus, (conversationKey) => {
    for (const connection of connections) {
      for (const [key, subscription] of connection.subscriptions) {
        if (`${subscription.requestId}:${subscription.guestTeamId}` === conversationKey) {
          push(connection, key);
        }
      }
    }
  });

  // Read in the web (an entry or a thread read, §5.34): every tab of that user at once; a closed
  // staff case (§5.35): every bell.
  const stopListeningInbox = onInboxChange(deps.bus, (userId) => {
    const following = inboxUserIds();
    if (userId === null) refreshInboxes(following);
    else if (following.includes(userId)) refreshInbox(userId);
  });

  /**
   * Sequential loop (await + sleep, never setInterval, §5.34): the bells of all users that follow
   * one, in one query; sends only what changed.
   */
  const pollInbox = async () => {
    for (;;) {
      try {
        await sleep(inboxPollMs, undefined, { signal: stopping.signal });
      } catch {
        return;
      }
      const userIds = inboxUserIds();
      if (userIds.length === 0) continue;
      const versions = new Map(userIds.map((userId) => [userId, inboxVersion(userId)]));
      try {
        const states = await deps.inboxStates(userIds);
        for (const connection of connections) {
          const state = states.get(connection.userId);
          // Read again meanwhile: that read sends the newer state.
          if (!state || versions.get(connection.userId) !== inboxVersion(connection.userId)) {
            continue;
          }
          sendInbox(connection, state);
        }
      } catch (error) {
        // E.g. the database is away for a moment; the next round reads again.
        console.error("Realtime inbox poll failed", error);
      }
    }
  };

  /**
   * Sequential loop (await + sleep, never setInterval, ARCHITECTURE §5.30): ping, drop connections
   * that did not answer the last ping, and those whose session no longer holds.
   */
  const heartbeat = async () => {
    for (;;) {
      try {
        await sleep(heartbeatMs, undefined, { signal: stopping.signal });
      } catch {
        return;
      }
      for (const connection of [...connections]) {
        try {
          if (!connection.alive) {
            connection.socket.terminate();
            continue;
          }
          connection.alive = false;
          connection.socket.ping();
          if ((await deps.sessionUserId(connection.headers)) !== connection.userId) {
            connection.socket.close(4401, "session ended");
          }
        } catch (error) {
          // E.g. the database is away for a moment; the next beat checks again.
          console.error("Realtime heartbeat failed", error);
        }
      }
    }
  };

  return {
    /** Listens on `port` (0: any free one), on `host` or all interfaces, and returns the port. */
    async listen(port: number, host?: string): Promise<number> {
      await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        http.listen(port, host, () => {
          http.off("error", reject);
          resolve();
        });
      });
      void heartbeat();
      void pollInbox();
      return (http.address() as AddressInfo).port;
    },
    async close(): Promise<void> {
      stopping.abort();
      stopListening();
      stopListeningInbox();
      for (const connection of connections) connection.socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
