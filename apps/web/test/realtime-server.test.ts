// The WebSocket server of the message threads (ARCHITECTURE §5.30) with real sockets on a free port;
// session and access are stubbed.
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { publishConversationChanges, realtimeBus } from "../lib/realtime/bus.ts";
import type { ServerMessage, Subscription, WireConversation } from "../lib/realtime/protocol.ts";
import { type RealtimeDeps, createRealtimeServer } from "../lib/realtime/server.ts";

const ORIGIN = "https://scrims.example";
const SUBSCRIPTION: Subscription = { requestId: "r1", guestTeamId: "g1", teamId: "g1" };

function conversation(body: string): WireConversation {
  return {
    requestId: "r1",
    guestTeamId: "g1",
    teamId: "g1",
    side: "GUEST",
    otherTeam: { id: "h1", name: "Host" },
    writable: true,
    asOf: new Date().toISOString(),
    messages: [
      {
        id: "m1",
        body,
        createdAt: new Date().toISOString(),
        authorName: "ana",
        teamName: "Guest",
        own: true,
        mine: true,
        reported: false,
      },
    ],
    firstUnreadId: null,
  };
}

const servers: { close(): Promise<void> }[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start(overrides: Partial<RealtimeDeps> = {}) {
  const snapshots: (Subscription & { userId: string })[] = [];
  let body = "erste";
  const server = createRealtimeServer({
    sessionUserId: async (headers) => (headers.get("cookie") === "session=ok" ? "user-1" : null),
    snapshot: async (input) => {
      snapshots.push(input);
      return conversation(body);
    },
    bus: new EventEmitter(),
    origin: ORIGIN,
    ...overrides,
  });
  servers.push(server);
  const port = await server.listen(0);
  return {
    port,
    snapshots,
    setBody: (next: string) => {
      body = next;
    },
  };
}

function connect(port: number, options: { origin?: string; cookie?: string; path?: string } = {}) {
  return new WebSocket(`ws://127.0.0.1:${port}${options.path ?? "/ws"}`, {
    headers: {
      origin: options.origin ?? ORIGIN,
      cookie: options.cookie ?? "session=ok",
    },
  });
}

/** Resolves with the HTTP status of a refused handshake. */
function refusedWith(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.on("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    socket.on("open", () => reject(new Error("handshake accepted")));
    socket.on("error", () => undefined);
  });
}

function nextMessage(socket: WebSocket): Promise<ServerMessage> {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString()) as ServerMessage));
  });
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

describe("realtime server", () => {
  it("refuses other origins, missing sessions and other paths before the upgrade", async () => {
    const { port } = await start();
    expect(await refusedWith(connect(port, { origin: "https://evil.example" }))).toBe(403);
    expect(await refusedWith(connect(port, { cookie: "session=gone" }))).toBe(401);
    expect(await refusedWith(connect(port, { path: "/other" }))).toBe(404);
  });

  it("sends a snapshot on subscribe and again on every change of the thread", async () => {
    const bus = new EventEmitter();
    const { port, snapshots, setBody } = await start({ bus });
    const socket = connect(port);
    await opened(socket);
    const first = nextMessage(socket);
    socket.send(JSON.stringify({ type: "subscribe", ...SUBSCRIPTION }));
    expect(await first).toMatchObject({
      type: "snapshot",
      key: "r1:g1:g1",
      conversation: { messages: [{ body: "erste" }] },
    });
    expect(snapshots).toEqual([{ ...SUBSCRIPTION, userId: "user-1" }]);

    setBody("zweite");
    const second = nextMessage(socket);
    bus.emit("change", "r1:g1");
    expect(await second).toMatchObject({ conversation: { messages: [{ body: "zweite" }] } });
    socket.close();
  });

  it("listens to the bus the server actions publish on", async () => {
    const { port } = await start({ bus: realtimeBus() });
    const socket = connect(port);
    await opened(socket);
    const first = nextMessage(socket);
    socket.send(JSON.stringify({ type: "subscribe", ...SUBSCRIPTION }));
    await first;
    const pushed = nextMessage(socket);
    publishConversationChanges([{ requestId: "r1", guestTeamId: "g1" }]);
    expect(await pushed).toMatchObject({ type: "snapshot", key: "r1:g1:g1" });
    socket.close();
  });

  it("denies a thread without access and pushes nothing for it afterwards", async () => {
    const bus = new EventEmitter();
    const { port } = await start({ bus, snapshot: async () => null });
    const socket = connect(port);
    await opened(socket);
    const denied = nextMessage(socket);
    socket.send(JSON.stringify({ type: "subscribe", ...SUBSCRIPTION }));
    expect(await denied).toEqual({ type: "denied", key: "r1:g1:g1" });
    let more = false;
    socket.on("message", () => {
      more = true;
    });
    bus.emit("change", "r1:g1");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(more).toBe(false);
    socket.close();
  });

  it("closes on invalid and too large messages", async () => {
    const { port } = await start();
    const invalid = connect(port);
    await opened(invalid);
    const invalidClose = new Promise<number>((resolve) => invalid.on("close", resolve));
    invalid.send("not json");
    expect(await invalidClose).toBe(1003);

    const large = connect(port);
    await opened(large);
    const largeClose = new Promise<number>((resolve) => large.on("close", resolve));
    large.send(JSON.stringify({ type: "subscribe", ...SUBSCRIPTION, requestId: "x".repeat(5000) }));
    expect(await largeClose).toBe(1009);
  });

  it("survives a client that resets the connection while the session is looked up", async () => {
    let release: () => void = () => undefined;
    const lookup = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { port } = await start({
      sessionUserId: async () => {
        await lookup;
        return "user-1";
      },
    });
    const { connect: rawConnect } = await import("node:net");
    const raw = rawConnect(port, "127.0.0.1");
    await new Promise<void>((resolve) => raw.once("connect", () => resolve()));
    raw.write(
      [
        "GET /ws HTTP/1.1",
        "Host: 127.0.0.1",
        "Upgrade: websocket",
        "Connection: Upgrade",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        `Origin: ${ORIGIN}`,
        "",
        "",
      ].join("\r\n"),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    raw.resetAndDestroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Still serving.
    const socket = connect(port);
    await opened(socket);
    socket.close();
  });

  it("drops connections whose session ended at the next heartbeat", async () => {
    let valid = true;
    const { port } = await start({
      sessionUserId: async () => (valid ? "user-1" : null),
      heartbeatMs: 20,
    });
    const socket = connect(port);
    await opened(socket);
    const closed = new Promise<number>((resolve) => socket.on("close", resolve));
    valid = false;
    expect(await closed).toBe(4401);
  });
});
