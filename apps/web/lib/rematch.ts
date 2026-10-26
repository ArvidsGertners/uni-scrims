// "Nochmal gegen dieses Team" (SPEC N-26): the request form with the opponent as target and the
// format, maps and Berlin start time of the scrim filled in; the date is left to choose.
import { toBerlinTimeString } from "@uni-scrims/core";
import type { ScrimFormat } from "@uni-scrims/db";

export function rematchHref(scrim: {
  opponent: { id: string };
  format: ScrimFormat;
  maps: string[];
  startsAt: Date;
}): string {
  const query = new URLSearchParams({
    team: scrim.opponent.id,
    format: scrim.format,
    time: toBerlinTimeString(scrim.startsAt),
  });
  for (const map of scrim.maps) query.append("maps", map);
  return `/requests/new?${query.toString()}`;
}
