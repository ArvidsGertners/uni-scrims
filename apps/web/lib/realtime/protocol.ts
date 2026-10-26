// The WebSocket protocol of the message threads (ARCHITECTURE §5.30), shared by the server in the
// web process and the browser; must not import server code.
import { z } from "zod";

/** The path of the WebSocket server, behind the proxy and on its own port alike. */
export const REALTIME_PATH = "/ws";
/** Longest message a client may send; subscriptions are a few IDs. */
export const MAX_CLIENT_MESSAGE_BYTES = 4096;
/** Threads one connection may follow at a time. */
export const MAX_SUBSCRIPTIONS = 10;
/** Open connections per user (tabs, devices). */
export const MAX_CONNECTIONS_PER_USER = 10;

const id = z.string().min(1).max(100);

export const subscriptionSchema = z.object({
  requestId: id,
  guestTeamId: id,
  /** The team the page reads and writes for (§5.20). */
  teamId: id,
});

export type Subscription = z.infer<typeof subscriptionSchema>;

export const clientMessageSchema = z.discriminatedUnion("type", [
  subscriptionSchema.extend({ type: z.literal("subscribe") }),
  subscriptionSchema.extend({ type: z.literal("unsubscribe") }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/** A subscription's key: thread and team, since a member of both teams could follow both sides. */
export function subscriptionKey(subscription: Subscription): string {
  return `${subscription.requestId}:${subscription.guestTeamId}:${subscription.teamId}`;
}

/** A message of a thread as it travels: dates as ISO strings. */
export type WireMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  teamName: string;
  own: boolean;
  mine: boolean;
  reported: boolean;
};

/** A thread as it travels (core's ConversationView with dates as ISO strings). */
export type WireConversation = {
  requestId: string;
  guestTeamId: string;
  teamId: string;
  side: "HOST" | "GUEST";
  otherTeam: { id: string; name: string };
  writable: boolean;
  asOf: string;
  messages: WireMessage[];
  firstUnreadId: string | null;
};

export type ServerMessage =
  | { type: "snapshot"; key: string; conversation: WireConversation }
  /** No access (anymore), or too many subscriptions; the subscription is dropped. */
  | { type: "denied"; key: string };
