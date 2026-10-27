/**
 * The form entries as sorted `key=value` pairs, so the order of several `rang` values is ignored
 * (§5.32).
 */
export function formSnapshot(entries: Iterable<[string, FormDataEntryValue]>): string {
  return [...entries]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .sort()
    .join("&");
}
