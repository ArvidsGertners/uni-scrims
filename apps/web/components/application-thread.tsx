"use client";

import { useState } from "react";
import { useMessages } from "@/components/locale-provider";
import { MessageThread } from "@/components/message-thread";
import { Badge } from "@/components/ui/badge";
import { messageThreadMessages } from "@/i18n/scrims-client";
import type { WireConversation } from "@/lib/realtime/protocol";

/**
 * The thread with one applicant on the creating team's request page (SPEC N-28), folded until it
 * is opened; only an open thread follows the WebSocket and counts as read.
 */
export function ApplicationThread({
  initial,
  realtimeUrl,
  focus,
}: {
  initial: WireConversation;
  realtimeUrl: string | null;
  focus: boolean;
}) {
  const t = useMessages(messageThreadMessages);
  const [open, setOpen] = useState(focus);
  const count = initial.messages.length;
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-sm border border-border bg-background"
    >
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 text-[14px] font-semibold">
        {t.toggle}
        {count > 0 ? <span className="font-label text-[12px] text-faint">{count}</span> : null}
        {initial.firstUnreadId ? <Badge variant="accent">{t.newBadge}</Badge> : null}
      </summary>
      {open ? (
        <MessageThread
          initial={initial}
          realtimeUrl={realtimeUrl}
          focus={focus}
          variant="embedded"
          className="border-t border-border"
        />
      ) : null}
    </details>
  );
}
