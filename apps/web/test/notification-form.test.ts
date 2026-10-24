// The notifications form (ARCHITECTURE §5.17): ticked boxes are on, missing ones off.
import { describe, expect, it } from "vitest";
import { notificationFieldName, parseNotificationForm } from "../lib/notification-form.ts";

describe("parseNotificationForm", () => {
  it("reads every type, a missing box as off", () => {
    const form = new FormData();
    form.set(notificationFieldName("discord", "SCRIM_BOOKED"), "on");
    form.set(notificationFieldName("email", "VERIFICATION_RESULT"), "on");
    expect(
      parseNotificationForm(form, ["SCRIM_BOOKED", "VERIFICATION_RESULT", "REMINDER_1H"]),
    ).toEqual({
      SCRIM_BOOKED: { discord: true, email: false },
      VERIFICATION_RESULT: { discord: false, email: true },
      REMINDER_1H: { discord: false, email: false },
    });
  });
});
