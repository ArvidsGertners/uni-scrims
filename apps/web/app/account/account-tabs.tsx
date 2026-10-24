import { TabNav } from "@/components/tab-nav";
import { WarningDot } from "@/components/warning-dot";

/**
 * The settings, the notifications and the verification (SPEC N-11, N-13, N-14); only for active
 * accounts, as /verify and the notifications need one.
 */
export function AccountTabs({
  current,
  unverified,
}: {
  current: "/account" | "/account/notifications" | "/verify";
  unverified: boolean;
}) {
  return (
    <TabNav
      label="Einstellungen"
      items={[
        { href: "/account", label: "Allgemein", active: current === "/account" },
        {
          href: "/account/notifications",
          label: "Benachrichtigungen",
          active: current === "/account/notifications",
        },
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
