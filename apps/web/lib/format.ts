const dateTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Display in Europe/Berlin (ARCHITECTURE §4). */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

/** Initials for round user avatars: the first two letters or digits of the Discord name. */
export function initials(name: string): string {
  return (name.match(/[\p{L}\p{N}]/gu) ?? []).slice(0, 2).join("").toUpperCase();
}
