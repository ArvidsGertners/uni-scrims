import { TabNav } from "@/components/tab-nav";
import { WarningDot } from "@/components/warning-dot";

/**
 * The settings and the verification (SPEC N-11, N-13); only for active accounts, as /verify needs
 * one.
 */
export function AccountTabs({
  current,
  unverified,
}: {
  current: "/account" | "/verify";
  unverified: boolean;
}) {
  return (
    <TabNav
      label="Einstellungen"
      items={[
        { href: "/account", label: "Allgemein", active: current === "/account" },
        {
          href: "/verify",
          label: "Verifizierung",
          active: current === "/verify",
          trailing: unverified ? <WarningDot /> : undefined,
        },
      ]}
    />
  );
}
