export const DEFAULT_AFTER_LOGIN = "/team";

/** Only same-site paths, so the login cannot redirect to another host. */
export function safeCallbackURL(value: string | string[] | undefined): string {
  if (typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  return value;
}
