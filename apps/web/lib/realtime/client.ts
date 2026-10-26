// The browser side of the message threads (ARCHITECTURE §5.30): one WebSocket per page for all
// threads on it, reconnecting with a growing pause and subscribing again, which brings fresh
// snapshots. Must not import server code.
import { useEffect, useRef, useState } from "react";
import {
  REALTIME_PATH,
  type ServerMessage,
  type Subscription,
  type WireConversation,
  subscriptionKey,
} from "./protocol.ts";

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10_000, 30_000];

export type RealtimeStatus = "connecting" | "open";

type Listener = {
  onSnapshot: (conversation: WireConversation) => void;
  onStatus: (status: RealtimeStatus) => void;
};

/**
 * The address of the server: REALTIME_PUBLIC_URL from the page, or /ws on the page's own address
 * (behind the proxy in production).
 */
export function realtimeAddress(configured: string | null, location: Location): string {
  if (configured) return configured;
  const url = new URL(REALTIME_PATH, location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class RealtimeConnection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptions = new Map<
    string,
    { subscription: Subscription; listeners: Set<Listener> }
  >();

  constructor(private readonly address: string) {}

  get status(): RealtimeStatus {
    return this.socket?.readyState === WebSocket.OPEN ? "open" : "connecting";
  }

  subscribe(subscription: Subscription, listener: Listener): () => void {
    const key = subscriptionKey(subscription);
    let entry = this.subscriptions.get(key);
    if (!entry) {
      entry = { subscription, listeners: new Set() };
      this.subscriptions.set(key, entry);
      this.sendSubscription("subscribe", subscription);
    }
    entry.listeners.add(listener);
    listener.onStatus(this.status);
    this.connect();
    return () => {
      const current = this.subscriptions.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size > 0) return;
      this.subscriptions.delete(key);
      this.sendSubscription("unsubscribe", subscription);
      if (this.subscriptions.size === 0) this.disconnect();
    };
  }

  private sendSubscription(type: "subscribe" | "unsubscribe", subscription: Subscription) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, ...subscription }));
    }
  }

  private notifyStatus() {
    for (const { listeners } of this.subscriptions.values()) {
      for (const listener of listeners) listener.onStatus(this.status);
    }
  }

  private connect() {
    if (this.socket || this.retry || this.subscriptions.size === 0) return;
    const socket = new WebSocket(this.address);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.attempt = 0;
      for (const { subscription } of this.subscriptions.values()) {
        this.sendSubscription("subscribe", subscription);
      }
      this.notifyStatus();
    });
    socket.addEventListener("message", (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      const entry = this.subscriptions.get(message.key);
      if (!entry) return;
      if (message.type === "snapshot") {
        for (const listener of entry.listeners) listener.onSnapshot(message.conversation);
      } else {
        // No access anymore: the page shows what it has; a reload shows the current state.
        this.subscriptions.delete(message.key);
      }
    });
    socket.addEventListener("close", () => {
      // A socket closed by disconnect() may report it after a new one opened; that one stays.
      if (this.socket !== socket) return;
      this.socket = null;
      this.notifyStatus();
      if (this.subscriptions.size === 0) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
      this.attempt++;
      this.retry = setTimeout(() => {
        this.retry = null;
        this.connect();
      }, delay);
    });
  }

  private disconnect() {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.socket?.close();
    this.socket = null;
  }
}

const connections = new Map<string, RealtimeConnection>();

function connectionFor(address: string): RealtimeConnection {
  let connection = connections.get(address);
  if (!connection) {
    connection = new RealtimeConnection(address);
    connections.set(address, connection);
  }
  return connection;
}

/**
 * Follows a thread while the component is mounted; `onSnapshot` gets every new snapshot. Returns
 * whether the connection is open.
 */
export function useThreadSubscription(
  configuredAddress: string | null,
  subscription: Subscription | null,
  onSnapshot: (conversation: WireConversation) => void,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  // The newest callback, so a new function per render does not subscribe again.
  const handler = useRef(onSnapshot);
  useEffect(() => {
    handler.current = onSnapshot;
  });
  const requestId = subscription?.requestId;
  const guestTeamId = subscription?.guestTeamId;
  const teamId = subscription?.teamId;
  useEffect(() => {
    if (!requestId || !guestTeamId || !teamId) return;
    const connection = connectionFor(realtimeAddress(configuredAddress, window.location));
    return connection.subscribe(
      { requestId, guestTeamId, teamId },
      { onSnapshot: (conversation) => handler.current(conversation), onStatus: setStatus },
    );
  }, [configuredAddress, requestId, guestTeamId, teamId]);
  return status;
}
