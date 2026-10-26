// WebSocket server of the message threads (ARCHITECTURE §5.30), in the web process on a port of its
// own: Next.js does not accept WebSocket upgrades itself. It only pushes; messages are written by
// server actions. Every push is a fresh snapshot, read with the subscriber's own rights.
import type { EventEmitter } from "node:events";
import { type IncomingHttpHeaders, type IncomingMessage, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";
import { type RawData, type WebSocket, WebSocketServer } from "ws";
import { onConversationChange } from "./bus.ts";
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_CONNECTIONS_PER_USER,
  MAX_SUBSCRIPTIONS,
  REALTIME_PATH,
  type ServerMessage,
  type Subscription,
  type WireConversation,
  clientMessageSchema,
  subscriptionKey,
} from "./protocol.ts";

export const HEARTBEAT_MS = 30_000;

export type RealtimeDeps = {
  /** The user of the session in these handshake headers, or null. */
  sessionUserId: (headers: Headers) => Promise<string | null>;
  /** The thread as the user may see it now, or null without access. */
  snapshot: (input: Subscription & { userId: string }) => Promise<WireConversation | null>;
  bus: EventEmitter;
  /** The only Origin a browser may connect from (BETTER_AUTH_URL), against cross-site use. */
  origin: string;
  heartbeatMs?: number;
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
  const allowedOrigin = originOf(deps.origin);
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
    };
    connections.add(connection);
    socket.on("pong", () => {
      connection.alive = true;
    });
    socket.on("message", (data) => onMessage(connection, data));
    socket.on("close", () => connections.delete(connection));
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
        if (!allowedOrigin || originOf(request.headers.origin) !== allowedOrigin) {
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
      return (http.address() as AddressInfo).port;
    },
    async close(): Promise<void> {
      stopping.abort();
      stopListening();
      for (const connection of connections) connection.socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
