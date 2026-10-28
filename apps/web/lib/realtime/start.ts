// Starts the WebSocket server of the message threads and the bell once per process (ARCHITECTURE
// §5.30, §5.34), from instrumentation.ts like the upload janitor.
import { getConversation, inboxStates, isDomainError } from "@uni-scrims/core";
import { auth } from "../auth.ts";
import { realtimeBus, toWireConversation } from "./bus.ts";
import { realtimePort } from "./config.ts";
import { createRealtimeServer } from "./server.ts";

// On globalThis: the dev server calls register() more than once and may re-import this module.
const state = globalThis as unknown as { realtimeServerStarted?: boolean };

export function startRealtimeServer(env: NodeJS.ProcessEnv = process.env): void {
  if (state.realtimeServerStarted) return;
  state.realtimeServerStarted = true;
  const port = realtimePort(env);
  const server = createRealtimeServer({
    // Never a refresh, which would want to set a cookie outside a request (§5.30).
    sessionUserId: async (headers) =>
      (await auth.api.getSession({ headers, query: { disableRefresh: true } }))?.user.id ?? null,
    snapshot: async (input) => {
      try {
        return toWireConversation(await getConversation({ ...input, now: new Date() }));
      } catch (error) {
        if (isDomainError(error)) return null;
        throw error;
      }
    },
    inboxStates: async (userIds) => {
      const states = await inboxStates(userIds);
      return new Map(
        [...states].map(([userId, state]) => [
          userId,
          { unread: state.unread, latest: state.latest?.toISOString() ?? null },
        ]),
      );
    },
    bus: realtimeBus(),
    origin: env.BETTER_AUTH_URL ?? "",
  });
  // Like `next dev -H`: on a server with the dev login only on 127.0.0.1 (README).
  server.listen(port, env.DEV_HOST || undefined).then(
    (listening) => console.log(`Realtime server on port ${listening}`),
    (error) => console.error("Realtime server could not start", error),
  );
}
