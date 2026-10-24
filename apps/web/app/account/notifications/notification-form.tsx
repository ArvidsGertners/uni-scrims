"use client";

import type { NotifType } from "@uni-scrims/db";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/action-state";
import { type NotificationChannelField, notificationFieldName } from "@/lib/notification-form";
import { saveNotificationsAction } from "../actions";

export type NotificationFormCategory = {
  key: string;
  title: string;
  types: {
    type: NotifType;
    label: string;
    /** "Nur als Captain" and the like, below the label. */
    hint: string | null;
    discord: boolean;
    email: boolean;
  }[];
};

const CHANNELS: { field: NotificationChannelField; label: string }[] = [
  { field: "discord", label: "Discord" },
  { field: "email", label: "E-Mail" },
];

/** One card per category, a Discord and a mail box per type (SPEC N-14); works without JavaScript. */
export function NotificationForm({ categories }: { categories: NotificationFormCategory[] }) {
  const [state, formAction, pending] = useActionState(saveNotificationsAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        {categories.map((category) => (
          <fieldset
            key={category.key}
            className="flex min-w-0 flex-col rounded-lg border border-border bg-card px-5 pt-4 pb-2"
          >
            <legend className="sr-only">{category.title}</legend>
            <div
              aria-hidden
              className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-end gap-2 pb-2"
            >
              <span className="type-label text-muted-foreground">{category.title}</span>
              {CHANNELS.map((channel) => (
                <span key={channel.field} className="text-center text-[12px] text-muted-foreground">
                  {channel.label}
                </span>
              ))}
            </div>
            {category.types.map((item) => (
              <div
                key={item.type}
                className="grid min-h-14 grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-t border-border py-2.5"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px]">{item.label}</span>
                  {item.hint ? (
                    <span className="text-[13px] text-muted-foreground">{item.hint}</span>
                  ) : null}
                </span>
                {CHANNELS.map((channel) => (
                  <label key={channel.field} className="flex min-h-11 items-center justify-center">
                    <input
                      type="checkbox"
                      name={notificationFieldName(channel.field, item.type)}
                      defaultChecked={item[channel.field]}
                      aria-label={`${item.label} per ${channel.label}`}
                      className="size-5 cursor-pointer accent-primary"
                    />
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="self-start px-6">
          Speichern
        </Button>
        {state.error ? (
          <p role="alert" className="text-[14px] text-accent-text">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
