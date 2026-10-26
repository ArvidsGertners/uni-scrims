import { cn } from "cn";
import { getMessages } from "@/lib/locale";
import { fullyVerifiedMessages } from "@/i18n/format";

/** The board and teams list parameter of the badge filter (SPEC N-21). */
export const FULLY_VERIFIED_PARAM = "verifiziert";

/**
 * Checkbox "Nur vollständig verifizierte Teams" in a GET filter form: sends verifiziert=1 when
 * checked, nothing otherwise, so the filter is off by default.
 */
export async function FullyVerifiedFilter({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  const t = await getMessages(fullyVerifiedMessages);
  return (
    <label className={cn("flex items-center gap-2.5 text-[14px]", className)}>
      <input
        type="checkbox"
        name={FULLY_VERIFIED_PARAM}
        value="1"
        defaultChecked={checked}
        className="size-4 shrink-0 accent-primary"
      />
      {t.filter}
    </label>
  );
}
