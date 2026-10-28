"use client";

import { useState } from "react";
import { useFormChangeNotify } from "@/components/filter-form";
import { useMessages } from "@/components/locale-provider";
import { Select, type SelectOption } from "@/components/ui/select";
import { leagueFilterMessages } from "@/i18n/client";

/**
 * Uniliga league filter with several leagues: board and teams list (SPEC N-36). No league chosen
 * means all; unlike the rank filter there is no default to opt out of.
 */
export function LeagueFilter({
  options,
  defaultValue,
}: {
  options: SelectOption[];
  defaultValue: string[];
}) {
  const t = useMessages(leagueFilterMessages);
  const [leagues, setLeagues] = useState(defaultValue);
  useFormChangeNotify(leagues);
  return (
    <Select
      multiple
      name="liga"
      value={leagues}
      onValueChange={setLeagues}
      placeholder={t.allLeagues}
      options={options}
    />
  );
}
