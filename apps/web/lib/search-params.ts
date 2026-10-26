// Query values of server pages with GET filters (board, teams list).

type ParamValue = string | string[] | undefined;

/** The value of a parameter that may appear once; repeated means none. */
export function single(value: ParamValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** All values of a parameter that may repeat, e.g. `?rang=GOLD&rang=PLATINUM`. */
export function list(value: ParamValue): string[] {
  return value === undefined ? [] : typeof value === "string" ? [value] : value;
}

/** The parameters as a query string with "?", repeated values kept; "" without any. */
export function toQueryString(params: Record<string, ParamValue>): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    for (const item of list(value)) query.append(name, item);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}
