"use client";

import { Dialog } from "@base-ui/react/dialog";
import { WHATS_NEW_SLIDES, type WhatsNewSlide } from "@uni-scrims/core/config/whats-new";
import { cn } from "cn";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { type ComponentType, type PointerEvent, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/components/icons";
import { useMessages } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { whatsNewMessages } from "@/i18n/client";
import { DirectRequestsArt } from "./art/direct-requests";
import { MessagesArt } from "./art/messages";
import { SNAP_EASE } from "./art/motion";
import { ReadyTodayArt } from "./art/ready-today";
import { WeeklyRequestsArt } from "./art/weekly-requests";

const ART: Record<WhatsNewSlide, ComponentType> = {
  messages: MessagesArt,
  readyToday: ReadyTodayArt,
  directRequests: DirectRequestsArt,
  weeklyRequests: WeeklyRequestsArt,
};

/** Where each feature lives (§5.31). */
const HREF: Record<WhatsNewSlide, string> = {
  messages: "/scrims?tab=anstehend",
  readyToday: "/scrims",
  directRequests: "/teams",
  weeklyRequests: "/requests/new",
};

/** A swipe of at least this many pixels turns the slide on phones. */
const SWIPE_PX = 40;

// The slides travel in the direction of the step; reduced motion keeps only the fade (MotionConfig).
const stageVariants = {
  enter: (direction: number) => ({ x: direction * 72, opacity: 0, scale: 0.96 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (direction: number) => ({ x: direction * -72, opacity: 0, scale: 0.96 }),
};
const textVariants = {
  enter: (direction: number) => ({ x: direction * 24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -24, opacity: 0 }),
};

/**
 * The what's new dialog (SPEC N-29, ARCHITECTURE §5.31): one slide per feature with its own art,
 * arrows and swipes to turn, a link to where the feature lives. Loaded on demand by
 * WhatsNewProvider; `onClose` saves the edition.
 */
export function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useMessages(whatsNewMessages);
  const [[index, direction], setPage] = useState<[number, number]>([0, 0]);
  const nextButton = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<number | null>(null);
  const count = WHATS_NEW_SLIDES.length;
  const slide = WHATS_NEW_SLIDES[index]!;
  const texts = t.slides[slide];
  const Art = ART[slide];
  const last = index === count - 1;

  const go = (next: number) => {
    if (next < 0 || next >= count || next === index) return;
    setPage([next, next > index ? 1 : -1]);
  };
  const endSwipe = (event: PointerEvent) => {
    if (swipeStart.current === null) return;
    const distance = event.clientX - swipeStart.current;
    swipeStart.current = null;
    if (Math.abs(distance) >= SWIPE_PX) go(index + (distance < 0 ? 1 : -1));
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--backdrop) transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          initialFocus={nextButton}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(index + 1);
            if (event.key === "ArrowLeft") go(index - 1);
          }}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-[calc(100%-24px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-border bg-card shadow-(--shadow-overlay) transition-[opacity,scale] duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.94] data-starting-style:opacity-0"
        >
          <LazyMotion features={domAnimation} strict>
            <MotionConfig reducedMotion="user">
              <div className="flex items-center gap-2.5 px-5 pt-4">
                <BrandMark />
                <Dialog.Title className="type-label flex-1 text-muted-foreground">
                  {t.kicker}
                </Dialog.Title>
                <span className="font-label text-[12px] text-faint" aria-hidden>
                  {index + 1}
                  {" / "}
                  {count}
                </span>
                <Dialog.Close
                  aria-label={t.close}
                  className="-mr-2 flex size-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <XIcon size={18} />
                </Dialog.Close>
              </div>

              {/* The stage: dot grid and the glow of the landing page behind the art. */}
              <div
                className="relative mx-5 mt-3 aspect-[16/9] touch-pan-y overflow-hidden rounded-sm border border-border bg-background select-none"
                onPointerDown={(event) => {
                  swipeStart.current = event.clientX;
                }}
                onPointerUp={endSwipe}
                onPointerCancel={() => {
                  swipeStart.current = null;
                }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
                    backgroundSize: "14px 14px",
                  }}
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,var(--glow-hero),transparent)]"
                />
                {/* Not initial={false}: it would keep the first slide's art from animating. */}
                <AnimatePresence custom={direction}>
                  <m.div
                    key={slide}
                    custom={direction}
                    variants={stageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.45, ease: SNAP_EASE }}
                    className="absolute inset-0 p-2"
                  >
                    <Art />
                  </m.div>
                </AnimatePresence>
              </div>

              {/* A steady height from 640 px, so the dialog does not jump between slides. */}
              <div
                className="relative overflow-hidden px-5 pt-5 sm:min-h-[10.5rem]"
                aria-live="polite"
              >
                <AnimatePresence initial={false} custom={direction} mode="wait">
                  <m.div
                    key={slide}
                    custom={direction}
                    variants={textVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.25, ease: SNAP_EASE }}
                    className="flex flex-col gap-2.5"
                  >
                    <h3 className="type-h2 text-[22px] text-pretty">{texts.title}</h3>
                    <p className="text-[15px] text-pretty text-muted-foreground">{texts.text}</p>
                    <Link
                      href={HREF[slide]}
                      onClick={onClose}
                      className="mt-0.5 inline-flex items-center gap-1 self-start text-[14px] font-semibold text-accent-text hover:underline"
                    >
                      {texts.cta}
                      <ChevronRightIcon size={16} strokeWidth={2.5} />
                    </Link>
                  </m.div>
                </AnimatePresence>
              </div>

              <div className="mt-auto flex flex-col gap-4 px-5 pt-5 pb-5">
                <div className="flex gap-1.5">
                  {WHATS_NEW_SLIDES.map((key, position) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => go(position)}
                      aria-label={t.goTo(position + 1, t.slides[key].title)}
                      aria-current={position === index ? "step" : undefined}
                      className="group flex h-6 flex-1 cursor-pointer items-center"
                    >
                      <span className="h-1.5 w-full overflow-hidden rounded-pill bg-secondary group-hover:bg-border-strong">
                        <m.span
                          className="block h-full rounded-pill bg-primary"
                          style={{ originX: 0 }}
                          initial={false}
                          animate={{ scaleX: position <= index ? 1 : 0 }}
                          transition={{ duration: 0.4, ease: SNAP_EASE }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => go(index - 1)}
                    disabled={index === 0}
                    className="gap-1 px-2"
                  >
                    <ChevronLeftIcon size={16} strokeWidth={2.5} />
                    {t.back}
                  </Button>
                  <span className="sr-only">{t.position(index + 1, count)}</span>
                  <Button
                    ref={nextButton}
                    size="sm"
                    onClick={() => (last ? onClose() : go(index + 1))}
                    className={cn("gap-1", last && "px-6")}
                  >
                    {last ? t.done : t.next}
                    {last ? null : <ChevronRightIcon size={16} strokeWidth={2.5} />}
                  </Button>
                </div>
              </div>
            </MotionConfig>
          </LazyMotion>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The logo's two chevrons snapping together, like the landing page's SnapIcon. */
function BrandMark() {
  return (
    <svg viewBox="10 10 180 180" className="size-6 shrink-0" aria-hidden>
      <m.polyline
        points="26,48 78,100 26,152"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ x: -26, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: SNAP_EASE, delay: 0.1 }}
      />
      <m.polyline
        points="174,48 122,100 174,152"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ x: 26, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: SNAP_EASE, delay: 0.1 }}
      />
    </svg>
  );
}
