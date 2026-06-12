"use client";

// Themed date picker — popover calendar surface anchored to a
// caller-styled trigger button. Replaces the native <input type="date">
// (whose OS popup can't be skinned to design tokens, leaking native
// blue/grey into the questionnaire). Pure React + Motion; no calendar
// library added (CLAUDE.md: prefer what's already in the project).
//
// API: caller owns the trigger's appearance via triggerClassName +
// triggerLabel so this primitive stays decoupled from questionnaire
// styles. Selection commits immediately on cell tap and closes the
// popover. Esc closes and returns focus to the trigger. Click outside
// closes. Past dates can be disabled via `min`.

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";

interface DatePickerProps {
  /** Selected date as ISO YYYY-MM-DD, or null when nothing selected. */
  value: string | null;
  /** Fires with the new ISO date when the user taps a cell. */
  onChange: (iso: string) => void;
  /** Earliest selectable date (ISO). Cells before are visually muted
   *  and unclickable. Month-nav arrows that would pass below are also
   *  disabled. */
  min?: string;
  /** Latest selectable date (ISO). Optional; unbounded by default. */
  max?: string;
  /** Tailwind classes for the trigger button — caller's pill style. */
  triggerClassName: string;
  /** Visible trigger label. Usually the formatted date when selected,
   *  a "Pick a date" prompt otherwise. */
  triggerLabel: ReactNode;
  /** Optional aria-label for the trigger; defaults to "Pick a date". */
  triggerAriaLabel?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(iso: string): Date {
  // Noon avoids DST edge cases at midnight where a local-day toISO
  // round-trip could land on the prior day in some timezones.
  return new Date(`${iso}T12:00:00`);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthGrid(displayed: Date): { date: Date; inMonth: boolean }[] {
  const first = startOfMonth(displayed);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - first.getDay());

  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + i);
    cells.push({
      date: cell,
      inMonth: cell.getMonth() === displayed.getMonth(),
    });
  }
  return cells;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  triggerClassName,
  triggerLabel,
  triggerAriaLabel = "Pick a date",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [displayed, setDisplayed] = useState<Date>(() => {
    const seed = value ? parseISO(value) : new Date();
    return startOfMonth(seed);
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const minDate = useMemo(
    () => (min ? startOfDay(parseISO(min)) : null),
    [min],
  );
  const maxDate = useMemo(
    () => (max ? startOfDay(parseISO(max)) : null),
    [max],
  );

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger so keyboard nav resumes there —
    // a11y standard the visual-audit batch enforced everywhere else.
    triggerRef.current?.focus();
  }, []);

  // Esc closes + returns focus.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, close]);

  // Click outside closes (mousedown beats focusout race with internal
  // taps on the day grid).
  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("touchstart", handleDown);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("touchstart", handleDown);
    };
  }, [open]);

  const cells = useMemo(() => monthGrid(displayed), [displayed]);
  const selectedDate = value ? startOfDay(parseISO(value)) : null;

  const canGoBack = useMemo(() => {
    if (!minDate) return true;
    const prevMonth = new Date(
      displayed.getFullYear(),
      displayed.getMonth() - 1,
      1,
    );
    return prevMonth >= startOfMonth(minDate);
  }, [displayed, minDate]);

  const canGoForward = useMemo(() => {
    if (!maxDate) return true;
    const nextMonth = new Date(
      displayed.getFullYear(),
      displayed.getMonth() + 1,
      1,
    );
    return nextMonth <= startOfMonth(maxDate);
  }, [displayed, maxDate]);

  const handleSelect = (date: Date) => {
    onChange(toLocalISODate(date));
    close();
  };

  const goPrev = () =>
    setDisplayed(
      new Date(displayed.getFullYear(), displayed.getMonth() - 1, 1),
    );
  const goNext = () =>
    setDisplayed(
      new Date(displayed.getFullYear(), displayed.getMonth() + 1, 1),
    );

  // Trigger keyboard model: Enter / Space toggles; Escape closes when
  // open (the window-level handler already covers this but we stop
  // propagation here for clarity).
  const handleTriggerKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <span className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((s) => {
            const next = !s;
            // On open, re-seed the displayed month to the value's
            // month (or today's). The user expects the calendar to
            // start where their last commit lives, not where they
            // last scrolled before closing.
            if (next) {
              const seed = value ? parseISO(value) : new Date();
              setDisplayed(startOfMonth(seed));
            }
            return next;
          });
        }}
        onKeyDown={handleTriggerKey}
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName}
      >
        {triggerLabel}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="dialog"
            aria-modal="false"
            aria-label="Choose a date"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-full z-50 mt-2 w-[18rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-2xl border border-border bg-cream p-3 shadow-lg font-sans"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canGoBack}
                aria-label="Previous month"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-burgundy-tint hover:text-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeftIcon />
              </button>
              <div
                className="text-sm font-medium text-charcoal"
                aria-live="polite"
              >
                {MONTHS[displayed.getMonth()]} {displayed.getFullYear()}
              </div>
              <button
                type="button"
                onClick={goNext}
                disabled={!canGoForward}
                aria-label="Next month"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-charcoal transition-colors hover:bg-burgundy-tint hover:text-burgundy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="py-1 text-center text-[10px] uppercase tracking-widest text-muted"
                  aria-hidden
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                const cellStart = startOfDay(cell.date);
                const iso = toLocalISODate(cellStart);
                const isSelected =
                  selectedDate !== null &&
                  toLocalISODate(selectedDate) === iso;
                const isToday = cellStart.getTime() === today.getTime();
                const isPast = minDate !== null && cellStart < minDate;
                const isFuture = maxDate !== null && cellStart > maxDate;
                const isDisabled = isPast || isFuture;

                const base =
                  "inline-flex h-10 w-10 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50";

                let style: string;
                if (isDisabled) {
                  style = "text-muted pointer-events-none";
                } else if (isSelected) {
                  // Selected wins over today — same cell shows the
                  // burgundy fill the user committed to.
                  style = "bg-burgundy text-cream font-medium";
                } else if (isToday) {
                  style =
                    "text-burgundy font-medium ring-1 ring-burgundy hover:bg-burgundy-tint";
                } else if (cell.inMonth) {
                  style =
                    "text-charcoal hover:bg-burgundy-tint hover:text-burgundy";
                } else {
                  style =
                    "text-warm-gray hover:bg-burgundy-tint hover:text-burgundy";
                }

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelect(cellStart)}
                    disabled={isDisabled}
                    aria-label={cell.date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                    aria-pressed={isSelected || undefined}
                    aria-current={isToday ? "date" : undefined}
                    className={`${base} ${style}`}
                  >
                    {cell.date.getDate()}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
