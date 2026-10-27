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
import { useSubmitConfirmation } from "@/components/confirm-dialog";
import { FlagIcon, LockIcon, MessageSquareIcon, SendIcon, TrashIcon } from "@/components/icons";
import { useLocale, useMessages } from "@/components/locale-provider";
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
 * A thread between two teams as a chat (SPEC N-28, ARCHITECTURE §5.30): live over the WebSocket,
 * grouped bubbles, the own team on the right in the accent, and the field to write at the bottom.
 * "panel" is the card at the top right of the request and scrim pages, "embedded" the folding
 * thread at an application. The page renders the first snapshot; newer ones replace it, whichever
 * way they come (push or the page after an action).
 */
export function MessageThread({
  initial,
  realtimeUrl,
  focus = false,
  variant = "panel",
  sticky = false,
  className,
}: {
  initial: WireConversation;
  realtimeUrl: string | null;
  /** Scrolled into view on load: the link of the notification (?chat=). */
  focus?: boolean;
  variant?: "panel" | "embedded";
  /** From 1024 px it stays in view while the page scrolls; only where nothing follows it. */
  sticky?: boolean;
  className?: string;
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
    // The thread a notification links to, also when it is empty by now.
    if (focus) root.current?.scrollIntoView({ block: "center" });
    const element = list.current;
    if (!element) return;
    const divider = dividerId ? element.querySelector("[data-unread-divider]") : null;
    if (divider instanceof HTMLElement) element.scrollTop = divider.offsetTop - 12;
    else element.scrollTop = element.scrollHeight;
  }, [dividerId, focus]);
  useEffect(() => {
    const element = list.current;
    if (element && atEnd.current) element.scrollTop = element.scrollHeight;
  }, [count]);

  const groups = groupMessages(conversation.messages, dividerId);
  const panel = variant === "panel";
  return (
    <section
      ref={root}
      id={`chat-${guestTeamId}`}
      aria-label={t.title(conversation.otherTeam.name)}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        panel
          ? "h-[min(34rem,78dvh)] rounded-lg border border-border-strong bg-card shadow-(--shadow-popup)"
          : "h-[24rem]",
        // Next to the scrim, the panel stays in view and takes the screen's height.
        panel && sticky && "lg:sticky lg:top-24 lg:h-[min(42rem,calc(100dvh-8rem))]",
        className,
      )}
    >
      {panel ? (
        <header className="relative flex items-center gap-3 border-b border-border px-4 py-3.5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_140%_at_0%_0%,var(--glow-hero),transparent)]"
          />
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-soft text-accent-text">
            <MessageSquareIcon size={20} />
          </span>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] leading-tight font-bold">{t.heading}</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {t.withTeam(conversation.otherTeam.name)}
            </span>
          </div>
          {/* A closed thread is still kept current, but nobody chats there any more. */}
          {conversation.writable ? (
            <LiveStatus status={status} showConnecting={showConnecting} className="relative" />
          ) : null}
        </header>
      ) : null}

      <div
        ref={list}
        onScroll={(event) => {
          const element = event.currentTarget;
          atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
        className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2.5 px-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <MessageSquareIcon size={22} />
            </span>
            <span className="text-[15px] font-semibold">{t.emptyTitle}</span>
            <span className="max-w-[30ch] text-[13px] text-pretty text-muted-foreground">
              {t.emptyText}
            </span>
          </div>
        ) : (
          // Few messages sit at the bottom, next to the field, as in a messenger. One row per message,
          // keyed by its id, so a deleted message does not remount the rows after it.
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
                  last={index === group.messages.length - 1}
                  spaced={groupIndex > 0 || index > 0}
                  teamId={teamId}
                  locale={locale}
                />
              )),
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border px-3 pt-3 pb-2.5">
        {!panel && conversation.writable && status !== "open" && showConnecting ? (
          <LiveStatus status={status} showConnecting className="mb-2 self-start" />
        ) : null}
        {conversation.writable ? (
          <MessageForm conversation={conversation} />
        ) : (
          <p className="flex items-center gap-2 rounded-sm bg-secondary px-3 py-2.5 text-[13px] text-pretty text-muted-foreground">
            <LockIcon size={14} />
            {t.closed}
          </p>
        )}
      </div>
    </section>
  );
}

/** "● Live" while the WebSocket is open, "Verbindet …" after a short pause otherwise. */
function LiveStatus({
  status,
  showConnecting,
  className,
}: {
  status: RealtimeStatus;
  showConnecting: boolean;
  className?: string;
}) {
  const t = useMessages(messageThreadMessages);
  if (status !== "open" && !showConnecting) return null;
  const open = status === "open";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold",
        open ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          open ? "bg-success motion-safe:animate-pulse-dot" : "bg-warning",
        )}
      />
      {open ? t.live : t.connecting}
    </span>
  );
}

/** A centred pill between two lines: a new day, or "Neu". */
function Separator({
  children,
  accent = false,
  unread = false,
}: {
  children: string;
  accent?: boolean;
  unread?: boolean;
}) {
  return (
    <div data-unread-divider={unread ? "" : undefined} className="flex items-center gap-3">
      <span className={cn("h-px flex-1", accent ? "bg-primary/40" : "bg-border")} />
      <span
        className={cn(
          "rounded-pill px-2.5 py-0.5 text-[11px] font-semibold",
          accent
            ? "bg-accent-soft text-accent-text uppercase"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {children}
      </span>
      <span className={cn("h-px flex-1", accent ? "bg-primary/40" : "bg-border")} />
    </div>
  );
}

/**
 * One message: the day and "Neu" before it where they start, the name line on the first bubble of
 * a group (none for the own messages), more space before a new group than inside one.
 */
function MessageRow({
  message,
  day,
  unread,
  first,
  last,
  spaced,
  teamId,
  locale,
}: {
  message: WireMessage;
  day: string | null;
  unread: string | null;
  first: boolean;
  last: boolean;
  spaced: boolean;
  teamId: string;
  locale: Locale;
}) {
  return (
    <div className={cn("flex flex-col gap-3", spaced && (first ? "mt-3" : "mt-1"))}>
      {day ? <Separator>{day}</Separator> : null}
      {unread ? (
        <Separator accent unread>
          {unread}
        </Separator>
      ) : null}
      <div className={cn("flex flex-col gap-1", message.own ? "items-end" : "items-start")}>
        {first && !message.mine ? (
          <span className="flex max-w-[85%] flex-wrap items-baseline gap-x-1.5 px-1 text-[12px] text-muted-foreground">
            <span className="font-semibold text-foreground">{message.authorName}</span>
            <span className="break-words">{message.teamName}</span>
          </span>
        ) : null}
        <Bubble message={message} teamId={teamId} locale={locale} last={last} />
      </div>
    </div>
  );
}

function Bubble({
  message,
  teamId,
  locale,
  last,
}: {
  message: WireMessage;
  teamId: string;
  locale: Locale;
  last: boolean;
}) {
  const t = useMessages(messageThreadMessages);
  const time = berlinFormat(locale, "time").format(new Date(message.createdAt));
  return (
    <div className={cn("flex max-w-[85%] flex-col", message.own ? "items-end" : "items-start")}>
      <div
        className={cn(
          "group/bubble flex items-center gap-1",
          message.own ? "flex-row-reverse" : "flex-row",
        )}
      >
        <div
          className={cn(
            "rounded-[18px] px-3.5 pt-2 pb-1.5",
            message.own ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
            // The tail of the last bubble of a group points to its side.
            last && (message.own ? "rounded-br-md" : "rounded-bl-md"),
          )}
        >
          <p className="text-[15px] leading-snug break-words whitespace-pre-line">{message.body}</p>
          <span
            className={cn(
              "mt-0.5 block text-right font-label text-[10.5px]",
              message.own ? "text-primary-foreground/70" : "text-faint",
            )}
          >
            {time}
          </span>
        </div>
        {message.mine ? (
          <BubbleAction kind="delete" message={message} teamId={teamId} />
        ) : message.own || message.reported ? null : (
          <BubbleAction kind="report" message={message} teamId={teamId} />
        )}
      </div>
      {message.reported ? (
        <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-faint">
          <FlagIcon size={11} />
          {t.reported}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Deleting the own message or reporting another team's, as a small icon next to the bubble: on
 * hover or focus with a mouse, always where a touch screen exists; asks first in the site's dialog.
 */
function BubbleAction({
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
        className="opacity-0 transition-opacity group-hover/bubble:opacity-100 focus-within:opacity-100 any-pointer-coarse:opacity-100"
      >
        <input type="hidden" name="messageId" value={message.id} />
        {kind === "report" ? <input type="hidden" name="teamId" value={teamId} /> : null}
        <button
          type="submit"
          disabled={pending}
          aria-label={label}
          title={label}
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
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
  const empty = !body.trim();
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="requestId" value={conversation.requestId} />
      <input type="hidden" name="guestTeamId" value={conversation.guestTeamId} />
      {/* The team the page acted for (§5.20). */}
      <input type="hidden" name="teamId" value={conversation.teamId} />
      <div className="flex items-end gap-2 rounded-[22px] border border-border-strong bg-background py-1.5 pr-1.5 pl-4 transition-[border-color,box-shadow] focus-within:border-ring focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
        <label htmlFor={fieldId} className="sr-only">
          {t.label}
        </label>
        <textarea
          id={fieldId}
          name="body"
          rows={1}
          maxLength={MESSAGE_MAX}
          value={body}
          placeholder={t.placeholder(conversation.otherTeam.name)}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!pending && body.trim()) event.currentTarget.form?.requestSubmit();
          }}
          className="max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug outline-none field-sizing-content placeholder:text-placeholder"
        />
        <button
          type="submit"
          aria-label={t.send}
          title={t.send}
          disabled={pending || empty}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors not-disabled:hover:bg-primary-hover disabled:cursor-default disabled:bg-secondary disabled:text-faint"
        >
          <SendIcon size={17} />
        </button>
      </div>
      <div className="flex justify-between gap-2 px-3 text-[11px] text-faint">
        <span>{t.hint}</span>
        {body.length >= COUNTER_FROM ? (
          <span className="font-label">
            {body.length}
            {"/"}
            {MESSAGE_MAX}
          </span>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="px-3 text-[13px] text-destructive-text">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
