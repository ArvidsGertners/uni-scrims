// Dev-only switches (ARCHITECTURE §7). Hard-disabled outside NODE_ENV=development.

type DevEnv = Record<string, string | undefined>;

export function isDevLoginEnabled(env: DevEnv = process.env): boolean {
  return env.NODE_ENV === "development" && env.DEV_LOGIN === "true";
}
