import { ShieldCheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { getMessages } from "@/lib/locale";
import { fullyVerifiedMessages } from "@/i18n/format";

/**
 * The badge of a team with at least 5 verified players or substitutes (SPEC N-21), in the small
 * form of the captain badge; teams without it get no counterpart.
 */
export async function FullyVerifiedBadge() {
  const t = await getMessages(fullyVerifiedMessages);
  return (
    <Badge variant="success" className="h-[22px] px-2 text-[12px]" title={t.badgeTitle}>
      <ShieldCheckIcon size={13} strokeWidth={2.5} />
      {t.badge}
    </Badge>
  );
}
