import { NOTIFICATION_SETTING_LABELS, getStaffNotificationPreferences } from "@uni-scrims/core";
import {
  NotificationForm,
  type NotificationFormCategory,
} from "@/app/account/notifications/notification-form";
import { getLocale, getMessages } from "@/lib/locale";
import { requireAdminShellPage } from "@/lib/session";
import { AdminShell } from "../admin-shell";
import { saveStaffNotificationsAction } from "../actions";
import { adminSettingsMessages } from "@/i18n/admin";

/** Discord per staff notification of the own areas (Phase 37, SPEC N-33, ARCHITECTURE §5.35). */
export default async function AdminSettingsPage() {
  const { staff, overview } = await requireAdminShellPage("/settings", "queue");
  const types = await getStaffNotificationPreferences(staff.id);
  const locale = await getLocale();
  const t = await getMessages(adminSettingsMessages);
  const categories: NotificationFormCategory[] = [
    {
      key: "staff",
      title: t.category,
      types: types.map((item) => ({
        type: item.type,
        label: NOTIFICATION_SETTING_LABELS[locale][item.type],
        hint: null,
        discord: item.discord,
      })),
    },
  ];

  return (
    <AdminShell overview={overview} current="/settings">
      <h1 className="type-h1">{t.title}</h1>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.intro}</p>
      <div className="max-w-xl">
        <NotificationForm
          categories={categories}
          channels={["discord"]}
          action={saveStaffNotificationsAction}
        />
      </div>
      <p className="max-w-3xl text-[14px] text-pretty text-muted-foreground">{t.bellAlways}</p>
    </AdminShell>
  );
}
