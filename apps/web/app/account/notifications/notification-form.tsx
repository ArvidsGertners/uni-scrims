"use client";

import type { NotifType } from "@uni-scrims/db";
import { useActionState, useRef } from "react";
import { useDirtyGuard } from "@/components/dirty-guard";
import { Masonry } from "@/components/masonry";
import { useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { notificationFormMessages } from "@/i18n/account-client";
import { type ActionState, initialActionState } from "@/lib/action-state";
import {
  type NotificationChannelField,
  SHOWN_TYPE_FIELD,
  notificationFieldName,
} from "@/lib/notification-form";
import { submitKeepingValues } from "@/lib/submit-form";
import { cn } from "@/lib/utils";
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
    email?: boolean;
  }[];
};

const BOTH_CHANNELS: NotificationChannelField[] = ["discord", "email"];

// Static, so Tailwind sees them: the label column and one column per channel.
const ROW_GRID = {
  1: "grid-cols-[minmax(0,1fr)_4.5rem]",
  2: "grid-cols-[minmax(0,1fr)_4.5rem_4.5rem]",
} as const;

/**
 * One card per category, a Discord and a mail box per type (SPEC N-14); works without JavaScript.
 * The staff settings in the admin area use it with Discord only and their own action (§5.35).
 */
export function NotificationForm({
  categories,
  isCaptain,
  channels = BOTH_CHANNELS,
  action = saveNotificationsAction,
}: {
  categories: NotificationFormCategory[];
  /** The role the defaults are shown for; saving compares against these values. */
  isCaptain?: boolean;
  channels?: NotificationChannelField[];
  action?: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const grid = ROW_GRID[channels.length as 1 | 2];
  const t = useMessages(notificationFormMessages);
  const formRef = useRef<HTMLFormElement>(null);
  const { markDispatched } = useDirtyGuard({ formRef, state });
  return (
    <form
      ref={formRef}
      action={formAction}
      // Keeps the boxes as the user set them when saving fails.
      onSubmit={(event) => {
        markDispatched();
        submitKeepingValues(event, formAction);
      }}
      className="flex flex-col gap-6"
    >
      {isCaptain !== undefined ? (
        <input type="hidden" name="shownAsCaptain" value={isCaptain ? "1" : "0"} />
      ) : null}
      {/* Two columns without gaps above a shorter category (§5.32). */}
      <Masonry grid={cn("grid grid-cols-1 gap-6", categories.length > 1 && "xl:grid-cols-2")}>
        {categories.map((category) => (
          <fieldset
            key={category.key}
            className="flex min-w-0 flex-col rounded-lg border border-border bg-card px-5 pt-4 pb-2"
          >
            <legend className="sr-only">{category.title}</legend>
            <div aria-hidden className={cn("grid items-end gap-2 pb-2", grid)}>
              <span className="type-label text-muted-foreground">{category.title}</span>
              {channels.map((channel) => (
                <span key={channel} className="text-center text-[12px] text-muted-foreground">
                  {t.channels[channel]}
                </span>
              ))}
            </div>
            {category.types.map((item) => (
              <div
                key={item.type}
                className={cn(
                  "grid min-h-14 items-center gap-2 border-t border-border py-2.5",
                  grid,
                )}
              >
                <input type="hidden" name={SHOWN_TYPE_FIELD} value={item.type} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[15px]">{item.label}</span>
                  {item.hint ? (
                    <span className="text-[13px] text-muted-foreground">{item.hint}</span>
                  ) : null}
                </span>
                {channels.map((channel) => (
                  <label key={channel} className="flex min-h-11 items-center justify-center">
                    <input
                      type="checkbox"
                      name={notificationFieldName(channel, item.type)}
                      defaultChecked={item[channel] ?? false}
                      aria-label={t.checkbox(item.label, t.channels[channel])}
                      className="size-5 cursor-pointer accent-primary"
                    />
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
        ))}
      </Masonry>
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="self-start px-6">
          {t.save}
        </Button>
        {state.error ? (
          <p role="alert" className="text-[14px] text-destructive-text">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
