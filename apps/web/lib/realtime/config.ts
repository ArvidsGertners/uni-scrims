// Where the WebSocket server of the message threads listens and where the browser finds it (§5.30).
// Server only: reads the environment.
import { REALTIME_PATH } from "./protocol.ts";

const DEFAULT_PORT = 3001;

export function realtimePort(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.REALTIME_PORT || DEFAULT_PORT);
}

/**
 * The address for the browser: REALTIME_PUBLIC_URL, otherwise null (/ws on the site's own address,
 * behind the proxy); in development the server's port on localhost.
 */
export function realtimePublicUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.REALTIME_PUBLIC_URL) return env.REALTIME_PUBLIC_URL;
  return env.NODE_ENV === "development"
    ? `ws://localhost:${realtimePort(env)}${REALTIME_PATH}`
    : null;
}
