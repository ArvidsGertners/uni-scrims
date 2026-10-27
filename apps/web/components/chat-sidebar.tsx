"use client";

import { cn } from "cn";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { MessageSquareIcon, XIcon } from "@/components/icons";
import { useMessages } from "@/components/locale-provider";
import { MessageThread } from "@/components/message-thread";
import { Button } from "@/components/ui/button";
import { messageThreadMessages } from "@/i18n/scrims-client";
import type { WireConversation } from "@/lib/realtime/protocol";

export type ChatThread = {
  conversation: WireConversation;
  /** The other team's avatar, rendered on the server. */
  avatar: ReactNode;
  /** Below the team name, e.g. its universities. */
  subtitle?: string;
};

/** From this width the sidebar stands next to the content; below it opens over the page. */
const DESKTOP_QUERY = "(min-width: 768px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// The server cannot know the width: there nothing counts as seen until the browser has measured.
const isDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
const isDesktopOnServer = () => false;

type ChatSidebarApi = { open: (guestTeamId: string) => void; unread: Record<string, boolean> };
const ChatSidebarContext = createContext<ChatSidebarApi | null>(null);

/**
 * The chats of a page as a sidebar at the right edge of the screen (SPEC N-28, ARCHITECTURE
 * §5.30): from 768 px next to the content, as high as the screen below the sticky header, like
 * the navigation on the left. Below 768 px a button at the bottom right slides the same sidebar
 * over the page. With several threads (the creating team's applications) tabs choose the team;
 * every thread stays mounted, so the hidden ones stay live and report unread messages.
 */
export function ChatSidebar({
  threads,
  initialTeamId,
  realtimeUrl,
  children,
}: {
  threads: ChatThread[];
  /** The thread a notification links to (?chat=); it also opens the sidebar on phones. */
  initialTeamId?: string;
  realtimeUrl: string | null;
  children: ReactNode;
}) {
  const t = useMessages(messageThreadMessages);
  const linked = threads.some((thread) => thread.conversation.guestTeamId === initialTeamId);
  const [selected, setSelected] = useState(
    () =>
      (linked
        ? initialTeamId
        : (threads.find((thread) => thread.conversation.firstUnreadId) ?? threads[0])?.conversation
            .guestTeamId) ?? "",
  );
  const [open, setOpen] = useState(linked);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, isDesktopOnServer);
  const [unread, setUnread] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      threads.map((thread) => [
        thread.conversation.guestTeamId,
        thread.conversation.firstUnreadId !== null,
      ]),
    ),
  );
  const closeButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    openButton.current?.focus();
  }, []);

  // Over the page on phones: Escape closes, the page behind does not scroll.
  const overlay = open && !desktop;
  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [overlay, close]);

  const reportUnread = useCallback((guestTeamId: string, value: boolean) => {
    setUnread((current) =>
      current[guestTeamId] === value ? current : { ...current, [guestTeamId]: value },
    );
  }, []);
  const openThread = useCallback((guestTeamId: string) => {
    setSelected(guestTeamId);
    setOpen(true);
  }, []);
  const anyUnread = Object.values(unread).some(Boolean);

  return (
    <ChatSidebarContext.Provider value={{ open: openThread, unread }}>
      <div className="flex min-h-full">
        <div className="min-w-0 flex-1" inert={overlay}>
          {children}
        </div>
        <aside
          aria-label={t.heading}
          role={overlay ? "dialog" : undefined}
          aria-modal={overlay || undefined}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-background transition-[translate] duration-300 ease-out motion-reduce:transition-none",
            // From 768 px: as high as the content (size containment keeps the chat from stretching
            // the page), the inner part sticky below the header and at most a screen high.
            "md:static md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-border md:transition-none md:contain-size lg:w-[360px] xl:w-[400px]",
            // Visible at once when opening (so the close button takes the focus), hidden only once
            // it has slid out when closing.
            !open &&
              "max-md:invisible max-md:translate-x-full max-md:transition-[translate,visibility]",
          )}
        >
          <div className="flex h-full min-h-0 flex-col md:sticky md:top-16 md:h-[calc(100dvh-4rem)] md:max-h-full">
            <div className="flex flex-col gap-3 border-b border-border px-5 pt-5 pb-4">
              <div className="flex min-h-6 items-center justify-between gap-3">
                <h2 className="type-label text-muted-foreground">{t.heading}</h2>
                <button
                  ref={closeButton}
                  type="button"
                  aria-label={t.close}
                  onClick={close}
                  className="-my-2.5 flex size-11 cursor-pointer items-center justify-center rounded-sm border border-border bg-card text-foreground md:hidden"
                >
                  <XIcon size={20} />
                </button>
              </div>
              {threads.length > 1 ? (
                <div
                  role="group"
                  aria-label={t.chooseTeam}
                  className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
                >
                  {threads.map(({ conversation }) => {
                    const id = conversation.guestTeamId;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={id === selected}
                        onClick={() => setSelected(id)}
                        className={cn(
                          "type-btn flex min-h-10 max-w-48 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground",
                          id === selected && "bg-secondary text-foreground",
                        )}
                      >
                        <span className="truncate">{conversation.otherTeam.name}</span>
                        {unread[id] ? <UnreadDot label={t.unreadHint} /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {threads.map(({ conversation, avatar, subtitle }) => (
              <div
                key={conversation.guestTeamId}
                hidden={conversation.guestTeamId !== selected}
                className="flex min-h-0 flex-1 flex-col"
              >
                <MessageThread
                  initial={conversation}
                  realtimeUrl={realtimeUrl}
                  active={conversation.guestTeamId === selected && (desktop || open)}
                  avatar={avatar}
                  subtitle={subtitle}
                  onUnreadChange={reportUnread}
                />
              </div>
            ))}
          </div>
        </aside>
        <Button
          ref={openButton}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 shadow-(--shadow-popup) md:hidden"
        >
          <MessageSquareIcon size={18} />
          {t.heading}
          {anyUnread ? <UnreadDot label={t.unreadHint} onAccent /> : null}
        </Button>
      </div>
    </ChatSidebarContext.Provider>
  );
}

function UnreadDot({ label, onAccent = false }: { label: string; onAccent?: boolean }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "size-2 shrink-0 rounded-full",
        onAccent ? "bg-primary-foreground" : "bg-primary",
      )}
    />
  );
}

/**
 * "Chat" at an application of the creating team: shows that team's thread in the sidebar (and
 * opens it on phones), with a dot while it has unread messages.
 */
export function OpenChatButton({ guestTeamId }: { guestTeamId: string }) {
  const t = useMessages(messageThreadMessages);
  const sidebar = useContext(ChatSidebarContext);
  if (!sidebar) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => sidebar.open(guestTeamId)}
      className="self-start"
    >
      <MessageSquareIcon size={16} />
      {t.openChat}
      {sidebar.unread[guestTeamId] ? <UnreadDot label={t.unreadHint} /> : null}
    </Button>
  );
}
