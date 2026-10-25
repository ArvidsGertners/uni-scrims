"use client";

import { useMessages } from "@/components/locale-provider";
import { warningDotMessages } from "@/i18n/client";

/**
 * The warning dot of a missing verification, in the navigation and on the account tab. A client
 * component for its name, as the navigation is one too.
 */
export function WarningDot() {
  const t = useMessages(warningDotMessages);
  return <span role="img" aria-label={t.unverified} className="size-1.5 rounded-full bg-warning" />;
}
