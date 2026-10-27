"use client";

import { INTL_LOCALES, type Locale } from "@uni-scrims/core/config/locale";
import { MESSAGE_MAX } from "@uni-scrims/core/config/limits";
import { cn } from "cn";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import {
  deleteMessageAction,
  markConversationReadAction,
  reportMessageAction,
  sendMessageAction,
} from "@/app/messages/actions";
import { useSubmitConfirmation } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { FlagIcon, LockIcon, MessageSquareIcon, TrashIcon } from "@/components/icons";
import { useLocale, useMessages } from "@/components/locale-provider";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type CalendarDay, shortDayMessages } from "@/i18n/client";
import { messageThreadMessages } from "@/i18n/scrims-client";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { type RealtimeStatus, useThreadSubscription } from "@/lib/realtime/client";
import type { WireConversation, WireMessage } from "@/lib/realtime/protocol";
import { submitKeepingValues } from "@/lib/submit-form";

const BERLIN = "Europe/Berlin";
const formats = new Map<string, Intl.DateTimeFormat>();

/**
 * Numeric dates in Europe/Berlin, the same on the server and in the browser: "time" as "20:05",
 * "key" for the parts of dayKey. Names come from the dictionary, never from Intl (§5.21).
 */
function berlinFormat(locale: Locale, kind: "time" | "key"): Intl.DateTimeFormat {
  const id = `${locale}-${kind}`;
  let format = formats.get(id);
  if (!format) {
    format =
      kind === "time"
        ? new Intl.DateTimeFormat(INTL_LOCALES[locale], {
            timeZone: BERLIN,
            hour: "2-digit",
            minute: "2-digit",
          })
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: BERLIN,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
    formats.set(id, format);
  }
  return format;
}

/** The Berlin day of an instant as "YYYY-MM-DD", from the parts, whatever order Intl uses. */
function dayKey(iso: string): string {
  const parts = berlinFormat("de", "key").formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The parts of a Berlin day "YYYY-MM-DD" for the dictionary; weekday 0 is Monday. */
function calendarDay(day: string): CalendarDay {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, date!));
  return { year: year!, month: month!, date: date!, weekday: (utc.getUTCDay() + 6) % 7 };
}

/** Messages of one person in a row, within this gap, share their name line. */
const GROUP_GAP_MS = 5 * 60 * 1000;
/** Pause before "Verbindet …", so a quick first connection does not flash it. */
const CONNECTING_HINT_DELAY_MS = 1500;
/** The counter appears near the limit only. */
const COUNTER_FROM = 800;

type Group = { day: string; messages: WireMessage[] };

/**
 * Messages in a row by the same person and team, at most GROUP_GAP_MS apart, form a group; a new
 * day and the "Neu" divider start a new one.
 */
function groupMessages(messages: WireMessage[], dividerId: string | null): Group[] {
  const groups: Group[] = [];
  for (const message of messages) {
    const day = dayKey(message.createdAt);
    const group = groups.at(-1);
    const previous = group?.messages.at(-1);
    const joins =
      group &&
      previous &&
      group.day === day &&
      message.id !== dividerId &&
      previous.authorName === message.authorName &&
      previous.teamName === message.teamName &&
      previous.own === message.own &&
      previous.mine === message.mine &&
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) <= GROUP_GAP_MS;
    if (joins) group.messages.push(message);
    else groups.push({ day, messages: [message] });
  }
  return groups;
}

/**
 * One thread between two teams in the chat sidebar (SPEC N-28, ARCHITECTURE §5.30): the other team
 * with the live status, the messages as boxes (the other team left, the own team right in the
 * accent) and the field to write. Live over the WebSocket; the page renders the first snapshot and
 * newer ones replace it, whichever way they come (push or the page after an action).
 *
 * `active` is the thread the reader sees (chosen, and on phones the sidebar open): only then it
 * marks read and scrolls. `onUnreadChange` tells the sidebar whether it still has unread messages.
 */
export function MessageThread({
  initial,
  realtimeUrl,
  active,
  avatar,
  subtitle,
  onUnreadChange,
}: {
  initial: WireConversation;
  realtimeUrl: string | null;
  active: boolean;
  avatar: ReactNode;
  subtitle?: string;
  onUnreadChange?: (guestTeamId: string, unread: boolean) => void;
}) {
  const t = useMessages(messageThreadMessages);
  const days = useMessages(shortDayMessages);
  const locale = useLocale();
  const [pushed, setPushed] = useState<WireConversation | null>(null);
  const conversation = pushed && pushed.asOf > initial.asOf ? pushed : initial;
  const { requestId, guestTeamId, teamId } = conversation;
  const status = useThreadSubscription(realtimeUrl, { requestId, guestTeamId, teamId }, (next) =>
    setPushed((current) => (!current || next.asOf > current.asOf ? next : current)),
  );
  // Where "Neu" stands, from the first view; marking read does not move it away while reading.
  const [dividerId] = useState(initial.firstUnreadId);

  // Read once the reader sees unread messages on a visible page (§5.30), once per newest message;
  // until then the sidebar shows a dot.
  const unreadUntil = conversation.firstUnreadId
    ? ([...conversation.messages].reverse().find((message) => !message.own)?.id ?? null)
    : null;
  const markedUntil = useRef<string | null>(null);
  useEffect(() => {
    if (!unreadUntil) {
      onUnreadChange?.(guestTeamId, false);
      return;
    }
    const mark = () => {
      if (!active || document.visibilityState !== "visible") return;
      if (markedUntil.current !== unreadUntil) {
        markedUntil.current = unreadUntil;
        void markConversationReadAction({ requestId, guestTeamId, teamId });
      }
      onUnreadChange?.(guestTeamId, false);
    };
    onUnreadChange?.(guestTeamId, markedUntil.current !== unreadUntil);
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [unreadUntil, active, requestId, guestTeamId, teamId, onUnreadChange]);

  // Scroll: when first seen to "Neu" or the end, afterwards to the end when a message comes in
  // while the reader is at the end anyway. A hidden thread has no height, so this waits for active.
  const list = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const seen = useRef(false);
  const count = conversation.messages.length;
  useEffect(() => {
    const element = list.current;
    if (!active || !element) return;
    if (seen.current) {
      if (atEnd.current) element.scrollTop = element.scrollHeight;
      return;
    }
    seen.current = true;
    const divider = dividerId ? element.querySelector("[data-unread-divider]") : null;
    if (divider instanceof HTMLElement) element.scrollTop = divider.offsetTop - 12;
    else element.scrollTop = element.scrollHeight;
  }, [active, dividerId, count]);

  const groups = groupMessages(conversation.messages, dividerId);
  return (
    <section
      aria-label={t.title(conversation.otherTeam.name)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[16px] font-semibold">{conversation.otherTeam.name}</span>
          {subtitle ? (
            <span className="truncate text-[13px] text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        {/* A closed thread is still kept current, but nobody chats there any more. */}
        {conversation.writable ? <LiveStatus status={status} /> : null}
      </div>

      <div
        ref={list}
        onScroll={(event) => {
          const element = event.currentTarget;
          atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
        // relative: the offsetTop of "Neu" counts from here.
        className="relative flex-1 overflow-y-auto overscroll-contain px-5 py-5"
      >
        {count === 0 ? (
          <EmptyState icon={<MessageSquareIcon size={24} />} title={t.emptyTitle} compact>
            {t.emptyText}
          </EmptyState>
        ) : (
          // Few messages sit at the bottom, next to the field. One row per message, keyed by its
          // id, so a deleted message does not remount the rows after it.
          <div className="flex min-h-full flex-col justify-end">
            {groups.flatMap((group, groupIndex) =>
              group.messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  day={
                    index === 0 && (groupIndex === 0 || groups[groupIndex - 1]!.day !== group.day)
                      ? days.day(calendarDay(group.day))
                      : null
                  }
                  unread={message.id === dividerId ? t.unread : null}
                  first={index === 0}
                  spaced={groupIndex > 0 || index > 0}
                  teamId={teamId}
                  locale={locale}
                />
              )),
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border px-5 pt-4 pb-5">
        {conversation.writable ? (
          <MessageForm conversation={conversation} />
        ) : (
          <p className="flex gap-2.5 rounded-sm border border-border bg-secondary px-3.5 py-3 text-[14px] text-pretty text-muted-foreground">
            <LockIcon size={16} className="mt-0.5 shrink-0" />
            {t.closed}
          </p>
        )}
      </div>
    </section>
  );
}

/** The status badge: "● Live" while the WebSocket is open, "Verbindet …" after a short pause. */
function LiveStatus({ status }: { status: RealtimeStatus }) {
  const t = useMessages(messageThreadMessages);
  const [showConnecting, setShowConnecting] = useState(false);
  useEffect(() => {
    if (status === "open") return;
    const timer = setTimeout(() => setShowConnecting(true), CONNECTING_HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShowConnecting(false);
    };
  }, [status]);
  if (status !== "open" && !showConnecting) return null;
  return (
    <Badge role="status" variant={status === "open" ? "success" : "warning"}>
      <BadgeDot />
      {status === "open" ? t.live : t.connecting}
    </Badge>
  );
}

/** A label between two hairlines, like the day heads of the board: a new day, or "Neu". */
function Separator({ children, unread = false }: { children: string; unread?: boolean }) {
  return (
    <div data-unread-divider={unread ? "" : undefined} className="flex items-center gap-3">
      <span className={cn("type-label", unread ? "text-accent-text" : "text-muted-foreground")}>
        {children}
      </span>
      <span className={cn("h-px flex-1", unread ? "bg-primary" : "bg-border")} />
    </div>
  );
}

/**
 * One message: the day and "Neu" before it where they start, Discord name and team above the first
 * box of a group, the time in every box (SPEC N-28), more space before a new group than inside one.
 */
function MessageRow({
  message,
  day,
  unread,
  first,
  spaced,
  teamId,
  locale,
}: {
  message: WireMessage;
  day: string | null;
  unread: string | null;
  first: boolean;
  spaced: boolean;
  teamId: string;
  locale: Locale;
}) {
  const t = useMessages(messageThreadMessages);
  const time = berlinFormat(locale, "time").format(new Date(message.createdAt));
  return (
    <div className={cn("flex flex-col gap-4", spaced && (first ? "mt-4" : "mt-1.5"))}>
      {day ? <Separator>{day}</Separator> : null}
      {unread ? <Separator unread>{unread}</Separator> : null}
      <div className={cn("flex flex-col gap-1.5", message.own ? "items-end" : "items-start")}>
        {first ? (
          <span
            className={cn(
              "flex max-w-[90%] flex-wrap items-baseline gap-x-2",
              message.own && "flex-row-reverse",
            )}
          >
            <span className="font-label text-[13px] font-semibold break-all">
              {message.mine ? t.you : message.authorName}
            </span>
            <span className="text-[12px] break-words text-muted-foreground">
              {message.teamName}
            </span>
          </span>
        ) : null}
        <div
          className={cn(
            "group/message flex max-w-[90%] items-start gap-1",
            message.own ? "flex-row-reverse" : "flex-row",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-sm border px-3.5 pt-2.5 pb-2",
              message.own ? "border-primary bg-accent-soft" : "border-transparent bg-secondary",
            )}
          >
            <p className="text-[15px] leading-snug break-words whitespace-pre-line">
              {message.body}
            </p>
            <span className="self-end font-label text-[11px] text-faint">{time}</span>
          </div>
          {message.mine ? (
            <MessageAction kind="delete" message={message} teamId={teamId} />
          ) : message.own || message.reported ? null : (
            <MessageAction kind="report" message={message} teamId={teamId} />
          )}
        </div>
        {message.reported ? (
          <span className="flex items-center gap-1 text-[12px] text-faint">
            <FlagIcon size={12} />
            {t.reported}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Deleting the own message or reporting another team's, as a small icon next to the box: on hover
 * or focus with a mouse, always where a touch screen exists; asks first in the site's dialog.
 */
function MessageAction({
  kind,
  message,
  teamId,
}: {
  kind: "delete" | "report";
  message: WireMessage;
  teamId: string;
}) {
  const t = useMessages(messageThreadMessages);
  const [state, action, pending] = useActionState(
    kind === "delete" ? deleteMessageAction : reportMessageAction,
    initialActionState,
  );
  const { confirm, dialog } = useSubmitConfirmation();
  const label = kind === "delete" ? t.delete : t.report;
  return (
    <div className="flex flex-col">
      <form
        action={action}
        onSubmit={(event) => {
          const text = kind === "delete" ? t.confirmDelete : t.confirmReport;
          if (!confirm(event, text, { label, destructive: true })) return;
          submitKeepingValues(event, action);
        }}
        className="opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 any-pointer-coarse:opacity-100"
      >
        <input type="hidden" name="messageId" value={message.id} />
        {kind === "report" ? <input type="hidden" name="teamId" value={teamId} /> : null}
        <button
          type="submit"
          disabled={pending}
          aria-label={label}
          title={label}
          className="flex size-9 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent-soft hover:text-accent-text"
        >
          {kind === "delete" ? <TrashIcon size={15} /> : <FlagIcon size={15} />}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="max-w-40 text-[12px] text-destructive-text">
          {state.error}
        </p>
      ) : null}
      {dialog}
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
    <form action={formAction} className="flex flex-col gap-2.5">
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
        className="max-h-40 min-h-[4.5rem] resize-none field-sizing-content"
      />
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[12px] text-pretty text-faint">
          {t.hint}
          {body.length >= COUNTER_FROM ? (
            <span className="font-label">
              {" · "}
              {body.length}
              {"/"}
              {MESSAGE_MAX}
            </span>
          ) : null}
        </span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          {t.send}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] text-destructive-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
