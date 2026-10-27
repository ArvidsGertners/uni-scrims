import {
  NOTIFICATION_CATEGORY_TITLES,
  NOTIFICATION_SETTING_LABELS,
  deliverableEmail,
  getNotificationPreferences,
} from "@uni-scrims/core";
import { DiscordDmWarning } from "@/components/discord-dm-warning";
import { DialogShell } from "@/components/dialog-shell";
import { verificationNeeded } from "@/lib/header-user";
import { requirePageUser } from "@/lib/session";
import { AccountTabs } from "../account-tabs";
import { NotificationForm, type NotificationFormCategory } from "./notification-form";
import { getLocale, getMessages } from "@/lib/locale";
import { notificationsPageMessages } from "@/i18n/account";

/** Discord and mail per notification (SPEC N-14, ARCHITECTURE §5.17), as a dialog (SPEC N-31). */
export async function NotificationsDialog({ intercepted }: { intercepted: boolean }) {
  const user = await requirePageUser("/account/notifications");
  const settings = await getNotificationPreferences(user.id);
  const email = deliverableEmail(user);
  const locale = await getLocale();
  const t = await getMessages(notificationsPageMessages);
  const categories: NotificationFormCategory[] = settings.categories.map((category) => ({
    key: category.key,
    title: NOTIFICATION_CATEGORY_TITLES[locale][category.key],
    types: category.types.map((item) => ({
      type: item.type,
      label: NOTIFICATION_SETTING_LABELS[locale][item.type],
      hint: t.hints[item.audience],
      discord: item.discord,
      email: item.email,
    })),
  }));

  return (
    <DialogShell title={t.title} size="wide" fallback="/scrims" intercepted={intercepted}>
      <AccountTabs
        current="/account/notifications"
        unverified={await verificationNeeded()}
        inDialog
      />
      <div className="flex max-w-3xl flex-col gap-3">
        <p className="text-pretty text-muted-foreground">
          {t.intro(
            <span className="font-semibold text-foreground">{user.name}</span>,
            email ? <span className="font-semibold break-all text-foreground">{email}</span> : null,
          )}
          {/* Captain in one team, member in another: no single default (§5.20). */}
          {settings.mixedRoles ? t.mixedRoles : null}
        </p>
        {user.hubJoinFailedAt || user.dmFailedAt ? (
          <DiscordDmWarning hubJoinFailed={user.hubJoinFailedAt !== null} />
        ) : null}
      </div>
      <NotificationForm categories={categories} isCaptain={settings.isCaptain} />
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.notSwitchable}</p>
    </DialogShell>
  );
}
