"use client";

import { INTL_LOCALES, type Locale } from "@uni-scrims/core/config/locale";
import { MESSAGE_MAX } from "@uni-scrims/core/config/limits";
import { cn } from "cn";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  deleteMessageAction,
  markConversationReadAction,
  reportMessageAction,
  sendMessageAction,
} from "@/app/messages/actions";
import { ActionForm } from "@/components/action-form";
import { useLocale, useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { messageThreadMessages } from "@/i18n/scrims-client";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { useThreadSubscription } from "@/lib/realtime/client";
import type { WireConversation, WireMessage } from "@/lib/realtime/protocol";

const times = new Map<Locale, Intl.DateTimeFormat>();

/** "26.10., 21:14" in Europe/Berlin; the same on the server and in the browser. */
function messageTime(iso: string, locale: Locale): string {
  let format = times.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      timeZone: "Europe/Berlin",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    times.set(locale, format);
  }
  return format.format(new Date(iso));
}

/** Pause before "Verbindung wird hergestellt …", so a quick first connection does not flash it. */
const CONNECTING_HINT_DELAY_MS = 1500;

/**
 * A thread between two teams (SPEC N-28, ARCHITECTURE §5.30): the messages, live over the WebSocket,
 * and the field to write. The page renders the first snapshot; newer ones replace it, whichever
 * way they come (push or the page after an action).
 */
export function MessageThread({
  initial,
  realtimeUrl,
  focus = false,
  className,
}: {
  initial: WireConversation;
  realtimeUrl: string | null;
  /** Scrolled into view on load: the link of the notification (?chat=). */
  focus?: boolean;
  className?: string;
}) {
  const t = useMessages(messageThreadMessages);
  const locale = useLocale();
  const [pushed, setPushed] = useState<WireConversation | null>(null);
  const conversation = pushed && pushed.asOf > initial.asOf ? pushed : initial;
  const { requestId, guestTeamId, teamId } = conversation;
  const status = useThreadSubscription(realtimeUrl, { requestId, guestTeamId, teamId }, (next) =>
    setPushed((current) => (!current || next.asOf > current.asOf ? next : current)),
  );
  // Where "Neu" stands, from the first view; marking read does not move it away while reading.
  const [dividerId] = useState(initial.firstUnreadId);
  const [showConnecting, setShowConnecting] = useState(false);
  useEffect(() => {
    if (status === "open") return;
    const timer = setTimeout(() => setShowConnecting(true), CONNECTING_HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShowConnecting(false);
    };
  }, [status]);

  // Read as soon as unread messages are on a visible page (§5.30), once per newest message.
  const unreadUntil = conversation.firstUnreadId
    ? ([...conversation.messages].reverse().find((message) => !message.own)?.id ?? null)
    : null;
  const markedUntil = useRef<string | null>(null);
  useEffect(() => {
    if (!unreadUntil) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || markedUntil.current === unreadUntil) return;
      markedUntil.current = unreadUntil;
      void markConversationReadAction({ requestId, guestTeamId, teamId });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [unreadUntil, requestId, guestTeamId, teamId]);

  // Scroll: on load to "Neu" or the end, afterwards to the end when a message comes in while the
  // reader is at the end anyway.
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const atEnd = useRef(true);
  const count = conversation.messages.length;
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const divider = dividerId ? element.querySelector("[data-unread-divider]") : null;
    if (divider instanceof HTMLElement) element.scrollTop = divider.offsetTop - element.offsetTop;
    else element.scrollTop = element.scrollHeight;
    if (focus) root.current?.scrollIntoView({ block: "center" });
  }, [dividerId, focus]);
  useEffect(() => {
    const element = list.current;
    if (element && atEnd.current) element.scrollTop = element.scrollHeight;
  }, [count]);

  return (
    <section
      ref={root}
      id={`chat-${guestTeamId}`}
      className={cn("flex flex-col gap-3", className)}
      aria-label={t.title(conversation.otherTeam.name)}
    >
      {count === 0 ? (
        <p className="text-[14px] text-pretty text-muted-foreground">{t.empty}</p>
      ) : (
        <div
          ref={list}
          onScroll={(event) => {
            const element = event.currentTarget;
            atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
          }}
          className="flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto overscroll-contain pr-1"
        >
          {conversation.messages.map((message) => (
            <div key={message.id} className="flex flex-col gap-2.5">
              {message.id === dividerId ? (
                <div
                  data-unread-divider
                  className="flex items-center gap-2 text-[12px] font-semibold text-accent-text"
                >
                  <span className="h-px flex-1 bg-primary/40" />
                  {t.unread}
                  <span className="h-px flex-1 bg-primary/40" />
                </div>
              ) : null}
              <MessageBubble message={message} teamId={teamId} locale={locale} />
            </div>
          ))}
        </div>
      )}

      {conversation.writable ? (
        <MessageForm conversation={conversation} />
      ) : (
        <p className="text-[13px] text-pretty text-muted-foreground">{t.closed}</p>
      )}
      {status !== "open" && showConnecting ? (
        <p role="status" className="text-[12px] text-faint">
          {t.connecting}
        </p>
      ) : null}
    </section>
  );
}

function MessageBubble({
  message,
  teamId,
  locale,
}: {
  message: WireMessage;
  teamId: string;
  locale: Locale;
}) {
  const t = useMessages(messageThreadMessages);
  return (
    <div
      className={cn(
        "flex max-w-[88%] flex-col gap-1 rounded-lg px-3.5 py-2.5",
        message.own ? "self-end bg-accent-soft" : "self-start bg-secondary",
      )}
    >
      <span className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          {message.mine ? t.you : message.authorName}
        </span>
        <span className="break-words">{message.teamName}</span>
        <span className="font-label text-faint">{messageTime(message.createdAt, locale)}</span>
      </span>
      <p className="text-[15px] break-words whitespace-pre-line">{message.body}</p>
      {message.mine ? (
        <ActionForm
          action={deleteMessageAction}
          submitLabel={t.delete}
          variant="link"
          size="bare"
          className="flex flex-col self-end"
          submitClassName="text-[12px] text-muted-foreground"
          confirmText={t.confirmDelete}
          confirmDestructive
        >
          <input type="hidden" name="messageId" value={message.id} />
        </ActionForm>
      ) : message.own ? null : message.reported ? (
        <span className="self-end text-[12px] text-faint">{t.reported}</span>
      ) : (
        <ActionForm
          action={reportMessageAction}
          submitLabel={t.report}
          variant="link"
          size="bare"
          className="flex flex-col self-end"
          submitClassName="text-[12px] text-muted-foreground"
          confirmText={t.confirmReport}
          confirmDestructive
        >
          <input type="hidden" name="messageId" value={message.id} />
          <input type="hidden" name="teamId" value={teamId} />
        </ActionForm>
      )}
    </div>
  );
}

function MessageForm({ conversation }: { conversation: WireConversation }) {
  const t = useMessages(messageThreadMessages);
  const [body, setBody] = useState("");
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      const result = await sendMessageAction(previous, formData);
      // Kept on an error, so nothing typed gets lost.
      if (result.done) setBody("");
      return result;
    },
    initialActionState,
  );
  const fieldId = `message-${conversation.guestTeamId}`;
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="requestId" value={conversation.requestId} />
      <input type="hidden" name="guestTeamId" value={conversation.guestTeamId} />
      {/* The team the page acted for (§5.20). */}
      <input type="hidden" name="teamId" value={conversation.teamId} />
      <label htmlFor={fieldId} className="sr-only">
        {t.label}
      </label>
      <Textarea
        id={fieldId}
        name="body"
        rows={2}
        maxLength={MESSAGE_MAX}
        value={body}
        placeholder={t.placeholder(conversation.otherTeam.name)}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!pending && body.trim()) event.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-faint">
          {t.hint} {body.length}/{MESSAGE_MAX}
        </span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {t.send}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-[14px] text-destructive-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
