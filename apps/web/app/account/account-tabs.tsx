import { TabNav } from "@/components/tab-nav";
import { WarningDot } from "@/components/warning-dot";
import { accountTabsMessages } from "@/i18n/account";
import { getMessages } from "@/lib/locale";

/**
 * The settings, the notifications and the verification (SPEC N-11, N-13, N-14); only for active
 * accounts, as /verify and the notifications need one. All three are route dialogs; switching
 * between them replaces the history entry (SPEC N-31).
 */
export async function AccountTabs({
  current,
  unverified,
  inDialog = false,
}: {
  current: "/account" | "/account/notifications" | "/verify";
  unverified: boolean;
  inDialog?: boolean;
}) {
  const t = await getMessages(accountTabsMessages);
  return (
    <TabNav
      label={t.label}
      items={[
        { href: "/account", label: t.general, active: current === "/account", replace: inDialog },
        {
          href: "/account/notifications",
          label: t.notifications,
          active: current === "/account/notifications",
          replace: inDialog,
        },
        {
          href: "/verify",
          label: t.verification,
          active: current === "/verify",
          replace: inDialog,
          trailing: unverified ? <WarningDot /> : undefined,
        },
      ]}
    />
  );
}
