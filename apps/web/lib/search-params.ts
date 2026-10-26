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
