// Changes of message threads (ARCHITECTURE §5.30) and of the bell (§5.34) inside the web process: the
// server actions publish after their commit, the WebSocket server pushes fresh state. On globalThis, because server
// actions and instrumentation.ts run in separate module graphs of the same process.
import { EventEmitter } from "node:events";
import { type ConversationKey, type ConversationView, conversationKeyOf } from "@uni-scrims/core";
import type { WireConversation } from "./protocol.ts";

const CHANGE = "change";
const INBOX_CHANGE = "inbox";

const state = globalThis as unknown as { uniScrimsRealtimeBus?: EventEmitter };

export function realtimeBus(): EventEmitter {
  if (!state.uniScrimsRealtimeBus) {
    // One listener per WebSocket server; no limit warning for tests that start several.
    state.uniScrimsRealtimeBus = new EventEmitter().setMaxListeners(0);
  }
  return state.uniScrimsRealtimeBus;
}

/** Threads that changed (a message sent, deleted, reported or removed). */
export function publishConversationChanges(keys: readonly ConversationKey[]): void {
  for (const key of keys) realtimeBus().emit(CHANGE, conversationKeyOf(key));
}

/** The bell of this user changed in the web (an entry or a thread read); the bot's are polled. */
export function publishInboxChange(userId: string): void {
  realtimeBus().emit(INBOX_CHANGE, userId);
}

/**
 * A staff case was closed in the web (Phase 37, §5.35): its entries are read for every staff member
 * who got them, so every bell is read again at once.
 */
export function publishInboxChangeAll(): void {
  realtimeBus().emit(INBOX_CHANGE, null);
}

/** `userId` null: every bell. */
export function onInboxChange(
  bus: EventEmitter,
  listener: (userId: string | null) => void,
): () => void {
  bus.on(INBOX_CHANGE, listener);
  return () => bus.off(INBOX_CHANGE, listener);
}

/** Listens to changes; returns the function that stops listening. */
export function onConversationChange(
  bus: EventEmitter,
  listener: (key: string) => void,
): () => void {
  bus.on(CHANGE, listener);
  return () => bus.off(CHANGE, listener);
}

/** core's view as it travels, for the page props and the WebSocket alike. */
export function toWireConversation(view: ConversationView): WireConversation {
  return {
    ...view,
    asOf: view.asOf.toISOString(),
    messages: view.messages.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}
