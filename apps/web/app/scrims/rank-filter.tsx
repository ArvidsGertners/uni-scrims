"use client";

import { useState } from "react";
import { useMessages } from "@/components/locale-provider";
import { Select, type SelectOption } from "@/components/ui/select";
import { rankFilterMessages } from "@/i18n/scrims-client";

/**
 * Rank filter of the board with several ranks (SPEC P0-4). No rank chosen means all ranks, sent
 * as "ALL", because a form without any `rang` falls back to the own team rank.
 */
export function RankFilter({
  options,
  defaultValue,
}: {
  options: SelectOption[];
  defaultValue: string[];
}) {
  const t = useMessages(rankFilterMessages);
  const [ranks, setRanks] = useState(defaultValue);
  return (
    <>
      <Select
        multiple
        name="rang"
        value={ranks}
        onValueChange={setRanks}
        placeholder={t.allRanks}
        options={options}
      />
      {ranks.length === 0 ? <input type="hidden" name="rang" value="ALL" /> : null}
    </>
  );
}
