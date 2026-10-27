"use client";

import { useState } from "react";
import { useFormChangeNotify } from "@/components/filter-form";
import { useMessages } from "@/components/locale-provider";
import { Select, type SelectOption } from "@/components/ui/select";
import { rankFilterMessages } from "@/i18n/client";

/**
 * Rank filter with several ranks: board (SPEC P0-4) and teams list (SPEC N-20). No rank chosen
 * means all ranks, sent as "ALL", because a board form without any `rang` falls back to the own
 * team rank.
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
  useFormChangeNotify(ranks);
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
