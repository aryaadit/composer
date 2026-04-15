"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { OptionCard } from "@/components/ui/OptionCard";
import { Button } from "@/components/ui/Button";

interface DayStepProps {
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
}

const DAYS_IN_CALENDAR = 28;

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

// Friday (5) / Saturday (6) / Sunday (0) → today; Mon-Thu → next Friday.
function firstUpcomingWeekendDay(from: Date): Date {
  const dow = from.getDay();
  if (dow === 5 || dow === 6 || dow === 0) return from;
  return addDays(from, 5 - dow);
}

function nextWeekendDay(from: Date): Date {
  const thisWeekend = firstUpcomingWeekendDay(from);
  const dow = thisWeekend.getDay();
  const daysPastSunday = dow === 5 ? 3 : dow === 6 ? 2 : 1;
  return firstUpcomingWeekendDay(addDays(thisWeekend, daysPastSunday));
}

function formatShort(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Monday of the week containing `d`. JS getDay: Sun=0, Mon=1, ..., Sat=6.
// Days back to Monday: (getDay() + 6) % 7.
function mondayOf(d: Date): Date {
  const back = (d.getDay() + 6) % 7;
  return addDays(d, -back);
}

interface Shortcut {
  id: "tonight" | "tomorrow" | "this-weekend" | "next-weekend";
  label: string;
  description: string;
  iso: string;
}

function buildShortcuts(now: Date): Shortcut[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const thisWeekend = firstUpcomingWeekendDay(today);
  const nextWeekend = nextWeekendDay(today);

  const out: Shortcut[] = [];
  if (now.getHours() < 21) {
    out.push({
      id: "tonight",
      label: "Tonight",
      description: formatShort(today),
      iso: toISO(today),
    });
  }
  out.push({
    id: "tomorrow",
    label: "Tomorrow",
    description: formatShort(tomorrow),
    iso: toISO(tomorrow),
  });
  out.push({
    id: "this-weekend",
    label: "This Weekend",
    description: formatShort(thisWeekend),
    iso: toISO(thisWeekend),
  });
  out.push({
    id: "next-weekend",
    label: "Next Weekend",
    description: formatShort(nextWeekend),
    iso: toISO(nextWeekend),
  });
  return out;
}

function isMidweek(now: Date): boolean {
  const dow = now.getDay();
  return dow >= 2 && dow <= 4;
}

export function DayStep({ selectedValue, onSelect }: DayStepProps) {
  const now = useMemo(() => new Date(), []);
  const shortcuts = useMemo(() => buildShortcuts(now), [now]);
  const shortcutIsoSet = useMemo(
    () => new Set(shortcuts.map((s) => s.iso)),
    [shortcuts]
  );

  // Expand the calendar automatically when the persisted value doesn't match
  // any shortcut (back-nav from a specific-date pick).
  const initiallyExpanded =
    selectedValue !== undefined && !shortcutIsoSet.has(selectedValue);
  const [calendarOpen, setCalendarOpen] = useState<boolean>(initiallyExpanded);
  const [pendingDate, setPendingDate] = useState<string | null>(
    initiallyExpanded ? selectedValue ?? null : null
  );

  const recommendId = isMidweek(now) ? "this-weekend" : null;

  // Calendar cells — 28 days starting from the Monday of the current week so
  // the 7-column grid always aligns on Mondays. Cells before `today` render
  // disabled.
  const calendarDays = useMemo(() => {
    const start = mondayOf(now);
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    return Array.from({ length: DAYS_IN_CALENDAR }, (_, i) => {
      const d = addDays(start, i);
      const d0 = new Date(d);
      d0.setHours(0, 0, 0, 0);
      return {
        date: d,
        iso: toISO(d),
        dayNum: d.getDate(),
        month: d.getMonth(),
        isPast: d0.getTime() < today0.getTime(),
        startsMonth: d.getDate() === 1,
      };
    });
  }, [now]);

  return (
    <div>
      {/* Shortcut cards */}
      <div className="flex flex-col gap-2">
        {shortcuts.map((s, i) => {
          const selected = selectedValue === s.iso && !calendarOpen;
          return (
            <div key={s.id} className="relative">
              <OptionCard
                label={s.label}
                description={s.description}
                selected={selected}
                onClick={() => onSelect(s.iso)}
                index={i}
              />
              {recommendId === s.id && (
                <span className="absolute top-3 right-4 inline-block px-2 py-0.5 text-[10px] font-sans font-medium tracking-wide uppercase rounded-full bg-burgundy/10 text-burgundy">
                  Recommended
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Specific-date toggle */}
      <div className="mt-5 flex justify-center">
        <button
          onClick={() => setCalendarOpen((v) => !v)}
          className="font-sans text-sm text-muted hover:text-charcoal transition-colors inline-flex items-center gap-1"
        >
          Pick a specific date
          <span aria-hidden>{calendarOpen ? "▴" : "▾"}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {calendarOpen && (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-5">
              {/* Weekday header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div
                    key={i}
                    className="text-center font-sans text-[10px] tracking-widest uppercase text-muted"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 4-week grid, grouped by week so month labels can sit above each row */}
              <div className="flex flex-col gap-1">
                {Array.from({ length: 4 }).map((_, wIdx) => {
                  const weekStart = calendarDays[wIdx * 7];
                  const showMonthLabel =
                    wIdx === 0 ||
                    calendarDays[wIdx * 7].month !==
                      calendarDays[wIdx * 7 - 1].month;
                  return (
                    <div key={wIdx}>
                      {showMonthLabel && (
                        <div className="font-sans text-[10px] tracking-widest uppercase text-muted mb-1 mt-1">
                          {weekStart.date.toLocaleDateString("en-US", {
                            month: "long",
                          })}
                        </div>
                      )}
                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays
                          .slice(wIdx * 7, wIdx * 7 + 7)
                          .map((cell) => {
                            const isSelected = pendingDate === cell.iso;
                            return (
                              <button
                                key={cell.iso}
                                onClick={() => setPendingDate(cell.iso)}
                                disabled={cell.isPast}
                                className={`aspect-square rounded-md font-sans text-sm transition-all ${
                                  cell.isPast
                                    ? "text-muted/40 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-burgundy text-cream"
                                    : "text-charcoal hover:bg-burgundy/5"
                                }`}
                              >
                                {cell.dayNum}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6">
                <Button
                  variant="primary"
                  onClick={() => pendingDate && onSelect(pendingDate)}
                  disabled={!pendingDate}
                  className="w-full"
                >
                  Continue
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
