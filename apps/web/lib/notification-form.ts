import type { NotifType } from "@uni-scrims/db";

export type NotificationChannelField = "discord" | "email";

/** The checkbox of one channel of one type in the notifications form (§5.17). */
export function notificationFieldName(channel: NotificationChannelField, type: NotifType): string {
  return `${channel}:${type}`;
}

/** Hidden field per row: the types the form showed (Phase 37, §5.35). */
export const SHOWN_TYPE_FIELD = "type";

/**
 * The staff settings form (§5.35): Discord for each type the form showed, a box not ticked is off.
 * Types it did not show are left out, so a role changed meanwhile keeps their setting.
 */
export function parseStaffNotificationForm(
  formData: FormData,
  staffTypes: readonly NotifType[],
): Partial<Record<NotifType, boolean>> {
  const shown = new Set(formData.getAll(SHOWN_TYPE_FIELD));
  return Object.fromEntries(
    staffTypes
      .filter((type) => shown.has(type))
      .map((type) => [type, formData.get(notificationFieldName("discord", type)) === "on"]),
  );
}

/** The submitted form: a box that is not ticked is not sent, so it means off. */
export function parseNotificationForm(formData: FormData, types: readonly NotifType[]) {
  return Object.fromEntries(
    types.map((type) => [
      type,
      {
        discord: formData.get(notificationFieldName("discord", type)) === "on",
        email: formData.get(notificationFieldName("email", type)) === "on",
      },
    ]),
  ) as Record<NotifType, { discord: boolean; email: boolean }>;
}
