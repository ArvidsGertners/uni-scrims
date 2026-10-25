import { TabNav } from "@/components/tab-nav";
import { WarningDot } from "@/components/warning-dot";
import { accountTabsMessages } from "@/i18n/account";
import { getMessages } from "@/lib/locale";

/**
 * The settings, the notifications and the verification (SPEC N-11, N-13, N-14); only for active
 * accounts, as /verify and the notifications need one.
 */
export async function AccountTabs({
  current,
  unverified,
}: {
  current: "/account" | "/account/notifications" | "/verify";
  unverified: boolean;
}) {
  const t = await getMessages(accountTabsMessages);
  return (
    <TabNav
      label={t.label}
      items={[
        { href: "/account", label: t.general, active: current === "/account" },
        {
          href: "/account/notifications",
          label: t.notifications,
          active: current === "/account/notifications",
        },
        {
          href: "/verify",
          label: t.verification,
          active: current === "/verify",
          trailing: unverified ? <WarningDot /> : undefined,
        },
      ]}
    />
  );
}
