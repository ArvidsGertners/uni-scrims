import { TabNav } from "@/components/tab-nav";
import { WarningDot } from "@/components/warning-dot";

/** Konto and its sub page (SPEC N-11); only for active accounts, as /verify needs one. */
export function AccountTabs({
  current,
  unverified,
}: {
  current: "/account" | "/verify";
  unverified: boolean;
}) {
  return (
    <TabNav
      label="Konto"
      items={[
        { href: "/account", label: "Konto", active: current === "/account" },
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
