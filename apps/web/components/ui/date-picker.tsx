"use client";

import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { controlClass } from "@/components/ui/input";

// Dates are Berlin calendar days as "YYYY-MM-DD", like the native date input sent them. The math
// runs on UTC midnights, so no time zone or daylight saving shift can move a day.
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKDAYS_LONG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

function toUtc(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!));
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number): string {
  const date = toUtc(day);
  date.setUTCDate(date.getUTCDate() + days);
  return toDay(date);
}

/** Same day of another month, or that month's last day. */
function addMonths(day: string, months: number): string {
  const date = toUtc(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay.getUTCDate()));
  return toDay(target);
}

/** Monday = 0. */
function weekdayIndex(day: string): number {
  return (toUtc(day).getUTCDay() + 6) % 7;
}

/** "Sa, 07.11.2026", as on the request cards. */
function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${WEEKDAYS[weekdayIndex(day)]}, ${date}.${month}.${year}`;
}

function formatDayLong(day: string): string {
  const date = toUtc(day);
  return `${WEEKDAYS_LONG[weekdayIndex(day)]}, ${date.getUTCDate()}. ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function berlinToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** The days of the month of `day` in weeks from Monday; null pads the first and last week. */
function monthWeeks(day: string): (string | null)[][] {
  const first = `${day.slice(0, 8)}01`;
  const days: (string | null)[] = Array<null>(weekdayIndex(first)).fill(null);
  for (let current = first; current.slice(0, 7) === first.slice(0, 7);) {
    days.push(current);
    current = addDays(current, 1);
  }
  while (days.length % 7 !== 0) days.push(null);
  return Array.from({ length: days.length / 7 }, (_, week) => days.slice(week * 7, week * 7 + 7));
}

type DatePickerProps = {
  name: string;
  defaultValue?: string | null;
  /** Earliest day that can be chosen. */
  min?: string;
  required?: boolean;
  /** Shown while no day is chosen. */
  placeholder?: string;
  /** Offers "Löschen" in the calendar, for optional dates. */
  clearable?: boolean;
};

/**
 * Date field in the look of the inputs with its own month calendar instead of the OS picker. The
 * form gets the day as "YYYY-MM-DD" through an input that also carries `required`.
 */
function DatePicker({
  name,
  defaultValue = null,
  min,
  required,
  placeholder = "Datum wählen",
  clearable,
}: DatePickerProps) {
  const [value, setValue] = useState<string | null>(defaultValue || null);
  const [open, setOpen] = useState(false);
  // The day with keyboard focus in the calendar; its month is the one shown.
  const [focused, setFocused] = useState(value ?? min ?? "");
  const [today, setToday] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusedRef = useRef<HTMLButtonElement>(null);
  const keyboardMove = useRef(false);

  const allowed = (day: string) => !min || day >= min;
  const clamp = (day: string) => (min && day < min ? min : day);

  function openChange(next: boolean) {
    if (next) {
      const now = berlinToday();
      setToday(now);
      setFocused(value ?? clamp(now));
    }
    setOpen(next);
  }

  function choose(day: string | null) {
    setValue(day);
    setOpen(false);
  }

  function moveFocus(day: string) {
    keyboardMove.current = true;
    setFocused(clamp(day));
  }

  // Focus the new day in the same commit: a month change removes the focused button, and the
  // popover would otherwise move focus to itself.
  useLayoutEffect(() => {
    if (!keyboardMove.current) return;
    keyboardMove.current = false;
    focusedRef.current?.focus();
  }, [focused]);

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekdayIndex(focused)),
      End: () => addDays(focused, 6 - weekdayIndex(focused)),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus(move());
  }

  const month = focused ? toUtc(focused) : null;
  const canGoBack = month !== null && (!min || focused.slice(0, 7) > min.slice(0, 7));

  return (
    <div className="relative min-w-0">
      <Popover.Root open={open} onOpenChange={openChange}>
        <Popover.Trigger
          ref={triggerRef}
          className={cn(
            controlClass,
            "flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3 text-left data-popup-open:border-ring data-popup-open:shadow-[0_0_0_3px_var(--accent-soft)]",
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
            {value ? formatDay(value) : placeholder}
          </span>
          <CalendarIcon size={18} className="text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="z-50 outline-none"
          >
            <Popover.Popup
              initialFocus={focusedRef}
              className="origin-(--transform-origin) rounded-sm border border-border-strong bg-popover p-3 text-popover-foreground shadow-(--shadow-popup) outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0"
            >
              {month ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      aria-label="Vorheriger Monat"
                      disabled={!canGoBack}
                      onClick={() => setFocused(clamp(addMonths(focused, -1)))}
                      className="flex size-11 cursor-pointer items-center justify-center rounded-[6px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ChevronLeftIcon size={18} />
                    </button>
                    <Popover.Title className="text-[15px] font-semibold" aria-live="polite">
                      {MONTHS[month.getUTCMonth()]} {month.getUTCFullYear()}
                    </Popover.Title>
                    <button
                      type="button"
                      aria-label="Nächster Monat"
                      onClick={() => setFocused(addMonths(focused, 1))}
                      className="flex size-11 cursor-pointer items-center justify-center rounded-[6px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <ChevronRightIcon size={18} />
                    </button>
                  </div>
                  <div
                    role="grid"
                    aria-label={`${MONTHS[month.getUTCMonth()]} ${month.getUTCFullYear()}`}
                    onKeyDown={onGridKeyDown}
                  >
                    <div role="row" className="grid grid-cols-7">
                      {WEEKDAYS.map((weekday, index) => (
                        <span
                          key={weekday}
                          role="columnheader"
                          aria-label={WEEKDAYS_LONG[index]}
                          className="flex h-8 items-center justify-center text-[12px] font-medium text-faint"
                        >
                          {weekday}
                        </span>
                      ))}
                    </div>
                    {monthWeeks(focused).map((week) => (
                      <div key={week.find(Boolean)} role="row" className="grid grid-cols-7">
                        {week.map((day, index) =>
                          day === null ? (
                            <span key={`pad-${index}`} role="gridcell" className="size-11" />
                          ) : (
                            <span key={day} role="gridcell" aria-selected={day === value}>
                              <button
                                type="button"
                                data-day={day}
                                ref={day === focused ? focusedRef : undefined}
                                tabIndex={day === focused ? 0 : -1}
                                disabled={!allowed(day)}
                                aria-label={formatDayLong(day)}
                                aria-current={day === today ? "date" : undefined}
                                onClick={() => choose(day)}
                                className={cn(
                                  "relative flex size-11 cursor-pointer items-center justify-center rounded-[6px] text-[15px] tabular-nums outline-none hover:bg-secondary focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] disabled:cursor-not-allowed disabled:text-faint/50 disabled:hover:bg-transparent",
                                  day === today && "font-semibold text-accent-text",
                                  day === value &&
                                    "bg-primary font-semibold text-primary-foreground hover:bg-primary-hover",
                                )}
                              >
                                {Number(day.slice(8))}
                              </button>
                            </span>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
                    {clearable && value ? (
                      <button
                        type="button"
                        onClick={() => choose(null)}
                        className="min-h-10 cursor-pointer rounded-[6px] px-2.5 text-[14px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        Löschen
                      </button>
                    ) : (
                      <span />
                    )}
                    {today && allowed(today) ? (
                      <button
                        type="button"
                        onClick={() => choose(today)}
                        className="min-h-10 cursor-pointer rounded-[6px] px-2.5 text-[14px] font-medium hover:bg-secondary"
                      >
                        Heute
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {/* Carries the value and `required` for the form; focus goes on to the trigger. */}
      <input
        name={name}
        value={value ?? ""}
        required={required}
        onChange={() => {}}
        onFocus={() => triggerRef.current?.focus()}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
      />
    </div>
  );
}

export { DatePicker };
