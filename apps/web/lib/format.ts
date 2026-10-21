const dateTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "medium",
  timeStyle: "short",
});

/** Display in Europe/Berlin (ARCHITECTURE §4). */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}
