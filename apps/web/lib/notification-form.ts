import type { NotifType } from "@uni-scrims/db";

export type NotificationChannelField = "discord" | "email";

/** The checkbox of one channel of one type in the notifications form (§5.17). */
export function notificationFieldName(channel: NotificationChannelField, type: NotifType): string {
  return `${channel}:${type}`;
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
