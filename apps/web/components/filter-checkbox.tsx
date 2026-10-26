import { RELIABILITY_WINDOW_DAYS, RELIABLE_NO_SHOW_RATE } from "@uni-scrims/core/config/limits";
import { cn } from "cn";
import { single } from "@/lib/search-params";
import { getMessages } from "@/lib/locale";
import { fullyVerifiedMessages, reliabilityMessages } from "@/i18n/format";

/** URL parameters of the checkbox filters on board and teams list (SPEC N-21, N-23). */
export const FILTER_PARAMS = { fullyVerified: "verifiziert", reliable: "zuverlaessig" } as const;

type SearchParams = Record<string, string | string[] | undefined>;

/** Both checkbox filters from the search params: on with "1", off otherwise. */
export function readCheckboxFilters(params: SearchParams) {
  return {
    fullyVerifiedOnly: single(params[FILTER_PARAMS.fullyVerified]) === "1",
    reliableOnly: single(params[FILTER_PARAMS.reliable]) === "1",
  };
}

/**
 * A checkbox in a GET filter form: sends `name=1` when checked, nothing otherwise, so the filter
 * is off by default.
 */
function FilterCheckbox({
  name,
  label,
  checked,
}: {
  name: string;
  label: string;
  checked: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-[14px]">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="size-4 shrink-0 accent-primary"
      />
      {label}
    </label>
  );
}

/** "Nur vollständig verifizierte Teams" and "Nur zuverlässige Teams" side by side. */
export async function CheckboxFilters({
  fullyVerifiedOnly,
  reliableOnly,
  className,
}: {
  fullyVerifiedOnly: boolean;
  reliableOnly: boolean;
  className?: string;
}) {
  const verified = await getMessages(fullyVerifiedMessages);
  const reliability = await getMessages(reliabilityMessages);
  return (
    <div className={cn("flex flex-wrap gap-x-6 gap-y-2", className)}>
      <FilterCheckbox
        name={FILTER_PARAMS.fullyVerified}
        label={verified.filter}
        checked={fullyVerifiedOnly}
      />
      <FilterCheckbox
        name={FILTER_PARAMS.reliable}
        // 0.1 * 100 is not exactly 10 in floating point.
        label={reliability.filter(Math.round(RELIABLE_NO_SHOW_RATE * 100), RELIABILITY_WINDOW_DAYS)}
        checked={reliableOnly}
      />
    </div>
  );
}
