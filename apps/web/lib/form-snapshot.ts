/** A file as its name and size: a picked file differs from the empty one of an untouched field. */
function entryValue(value: FormDataEntryValue): string {
  return typeof value === "string" ? value : `file:${value.name}:${value.size}`;
}

/**
 * The form entries as sorted `key=value` pairs, so the order of several `rang` values is ignored
 * (§5.32).
 */
export function formSnapshot(entries: Iterable<[string, FormDataEntryValue]>): string {
  return [...entries]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(entryValue(value))}`)
    .sort()
    .join("&");
}

/** What an untouched file field puts into the form data. */
const EMPTY_FILE = "file::0";

/**
 * The entries the form had when rendered: the default values of fields the user may have changed
 * before hydration, the current value of hidden inputs set by React (§5.32, §5.33).
 */
export function defaultEntries(form: HTMLFormElement): [string, string][] {
  const entries: [string, string][] = [];
  for (const element of form.elements) {
    if (element instanceof HTMLTextAreaElement) {
      if (element.name && !element.disabled) entries.push([element.name, element.defaultValue]);
      continue;
    }
    if (!(element instanceof HTMLInputElement) || !element.name || element.disabled) continue;
    if (element.type === "checkbox" || element.type === "radio") {
      if (element.defaultChecked) entries.push([element.name, element.value]);
    } else if (element.type === "file") {
      entries.push([element.name, EMPTY_FILE]);
    } else if (element.type !== "submit" && element.type !== "button") {
      entries.push([element.name, element.defaultValue]);
    }
  }
  return entries;
}
