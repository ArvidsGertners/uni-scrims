// The browser connection of the message threads (ARCHITECTURE §5.30), with a fake WebSocket.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeConnection } from "../lib/realtime/client.ts";

type Listener = (event: { data?: unknown }) => void;

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(data);
  }
  /** Like a browser: the close event comes later. */
  close() {
    this.closed = true;
  }
  fire(type: string, event: { data?: unknown } = {}) {
    if (type === "open") this.readyState = FakeSocket.OPEN;
    if (type === "close") this.readyState = 3;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const SUBSCRIPTION = { requestId: "r1", guestTeamId: "g1", teamId: "g1" };
const noop = { onSnapshot: () => undefined, onStatus: () => undefined };

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("realtime connection", () => {
  it("keeps a new socket when the old one reports its close late", () => {
    const connection = new RealtimeConnection("ws://example/ws");
    const stop = connection.subscribe(SUBSCRIPTION, noop);
    const [first] = FakeSocket.instances;
    first!.fire("open");
    // Unmount and mount in one commit: the old socket closes, a new one opens.
    stop();
    connection.subscribe(SUBSCRIPTION, noop);
    expect(first!.closed).toBe(true);
    const second = FakeSocket.instances[1]!;
    first!.fire("close");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
    second.fire("open");
    expect(second.sent.map((data) => JSON.parse(data).type)).toEqual(["subscribe"]);
    expect(connection.status).toBe("open");
  });

  it("reconnects with a growing pause and subscribes again", () => {
    const connection = new RealtimeConnection("ws://example/ws");
    const snapshots: unknown[] = [];
    connection.subscribe(SUBSCRIPTION, { ...noop, onSnapshot: (c) => snapshots.push(c) });
    FakeSocket.instances[0]!.fire("close");
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    const next = FakeSocket.instances[1]!;
    next.fire("open");
    expect(next.sent.map((data) => JSON.parse(data))).toEqual([
      { type: "subscribe", ...SUBSCRIPTION },
    ]);
    next.fire("message", {
      data: JSON.stringify({ type: "snapshot", key: "r1:g1:g1", conversation: { asOf: "x" } }),
    });
    expect(snapshots).toEqual([{ asOf: "x" }]);
  });
});
