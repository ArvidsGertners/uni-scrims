"use client";

import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { type InboxListEntry, listInboxAction, markInboxReadAction } from "@/app/inbox/actions";
import { BellIcon, SparkIcon } from "@/components/icons";
import { useMessages } from "@/components/locale-provider";
import { useWhatsNew } from "@/components/whats-new/whats-new-provider";
import { notificationBellMessages } from "@/i18n/client";
import { useInboxState } from "@/lib/realtime/client";
import { relativeAge } from "@/lib/relative-age";

type Messages = (typeof notificationBellMessages)["de"];

/** undefined while loading, null if it failed. */
type Entries = InboxListEntry[] | null | undefined;

function ageText(createdAt: string, now: Date, t: Messages): string {
  const age = relativeAge(new Date(createdAt), now);
  if (age.unit === "now") return t.justNow;
  if (age.unit === "minutes") return t.minutesAgo(age.value);
  if (age.unit === "hours") return t.hoursAgo(age.value);
  return t.daysAgo(age.value);
}

/**
 * The bell in the header (SPEC N-32, §5.34): the unread count follows the WebSocket server, the
 * list loads on opening and again while open whenever the count changes. Opening reads nothing;
 * a click on an entry reads it and follows its link, "Alle als gelesen" reads all. "Neuigkeiten"
 * stands on top and counts while the what's new dialog is due.
 */
export function NotificationBell({
  initialUnread,
  realtimeUrl,
}: {
  initialUnread: number;
  realtimeUrl: string | null;
}) {
  const t = useMessages(notificationBellMessages);
  const whatsNew = useWhatsNew();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entries>(undefined);
  const [now, setNow] = useState(() => new Date());
  // Loads that answer out of order: only the newest one shows.
  const loads = useRef(0);
  const opened = useRef(false);

  const load = useCallback(async () => {
    const run = ++loads.current;
    const loaded = await listInboxAction().catch(() => null);
    if (run !== loads.current) return;
    setEntries(loaded);
    setNow(new Date());
  }, []);

  // A new entry or one read in another tab while the list is open.
  const { unread } = useInboxState(realtimeUrl, initialUnread, () => {
    if (opened.current) void load();
  });
  const count = unread + (whatsNew.pending ? 1 : 0);

  const changeOpen = (next: boolean) => {
    opened.current = next;
    setOpen(next);
    if (next) void load();
  };

  const read = (entry: InboxListEntry) => {
    changeOpen(false);
    if (entry.read) return;
    setEntries((current) =>
      current?.map((item) => (item.id === entry.id ? { ...item, read: true } : item)),
    );
    void markInboxReadAction({ itemId: entry.id });
  };

  const readAll = () => {
    setEntries((current) => current?.map((item) => ({ ...item, read: true })));
    void markInboxReadAction({});
  };

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger
        aria-label={t.button(count)}
        className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border bg-card text-foreground hover:border-border-strong data-popup-open:border-border-strong"
      >
        <BellIcon size={20} />
        {count > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-label text-[11px] leading-none font-semibold text-primary-foreground"
          >
            {count > 9 ? t.many : count}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <Popover.Popup className="flex max-h-[min(34rem,calc(100dvh-6rem))] w-[min(26rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col rounded-sm border border-border-strong bg-popover text-popover-foreground shadow-(--shadow-popup) outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div className="flex items-center justify-between gap-3 border-b border-border py-1 pr-1 pl-4">
              <Popover.Title className="text-[15px] font-semibold">{t.title}</Popover.Title>
              <button
                type="button"
                onClick={readAll}
                disabled={unread === 0}
                className="type-btn min-h-11 cursor-pointer rounded-[6px] px-3 text-[13px] font-semibold text-primary hover:bg-secondary disabled:cursor-default disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-transparent"
              >
                {t.markAllRead}
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-1">
              {whatsNew.pending ? (
                <button
                  type="button"
                  onClick={() => {
                    changeOpen(false);
                    whatsNew.open();
                  }}
                  className={cn(ENTRY_CLASS, "bg-accent-soft")}
                >
                  <SparkIcon size={16} className="mt-0.5 text-primary" />
                  <EntryText title={t.whatsNew} description={t.whatsNewText} unread={t.unread} />
                </button>
              ) : null}
              {entries === undefined ? (
                <p className="px-3 py-4 text-[14px] text-muted-foreground">{t.loading}</p>
              ) : entries === null ? (
                <p role="alert" className="px-3 py-4 text-[14px] text-muted-foreground">
                  {t.failed}
                </p>
              ) : entries.length === 0 && !whatsNew.pending ? (
                <p className="px-3 py-4 text-[14px] text-muted-foreground">{t.empty}</p>
              ) : (
                <ul>
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <Link href={entry.href} onClick={() => read(entry)} className={ENTRY_CLASS}>
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            entry.read ? "bg-transparent" : "bg-primary",
                          )}
                        />
                        <EntryText
                          title={entry.title}
                          description={entry.description}
                          age={ageText(entry.createdAt, now, t)}
                          unread={entry.read ? null : t.unread}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const ENTRY_CLASS =
  "flex w-full cursor-pointer items-start gap-3 rounded-[6px] px-3 py-2.5 text-left text-foreground outline-none hover:bg-secondary focus-visible:bg-secondary";

function EntryText({
  title,
  description,
  age,
  unread,
}: {
  title: string;
  description: string;
  age?: string;
  /** For screen readers; null when read. */
  unread: string | null;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] leading-snug font-semibold">
          {unread ? <span className="sr-only">{`${unread}: `}</span> : null}
          {title}
        </span>
        {age ? (
          <span className="shrink-0 text-[12px] whitespace-nowrap text-muted-foreground">
            {age}
          </span>
        ) : null}
      </span>
      <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
        {description}
      </span>
    </span>
  );
}
