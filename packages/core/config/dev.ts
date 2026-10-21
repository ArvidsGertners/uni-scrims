// Dev-only switches (ARCHITECTURE §7). Hard-disabled outside NODE_ENV=development.

export type DevEnv = Record<string, string | undefined>;

function devValue(env: DevEnv, name: string): string | null {
  if (env.NODE_ENV !== "development") return null;
  return env[name]?.trim() || null;
}

export function isDevLoginEnabled(env: DevEnv = process.env): boolean {
  return devValue(env, "DEV_LOGIN") === "true";
}

/** All DMs go to this Discord ID (seed users have made-up IDs), or null. */
export function getDevDmRedirectId(env: DevEnv = process.env): string | null {
  return devValue(env, "DEV_DM_REDIRECT_DISCORD_ID");
}

/** All team channel posts go to this channel, also for teams without /setup, or null. */
export function getDevChannelId(env: DevEnv = process.env): string | null {
  return devValue(env, "DEV_CHANNEL_ID");
}
