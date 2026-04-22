"use client";

// Combined day + duration step. Replaces the old separate DayStep + TimeStep.
//
// Outputs `{ day, duration }` via onContinue. The API route resolves
// duration → concrete startTime/endTime before the rest of the pipeline
// runs, so `planStopMix` and friends stay unchanged.

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { DURATIONS, DEFAULT_DURATION } from "@/config/durations";
import type { Duration } from "@/types";

interface UpcomingDay {
  date: string; // ISO "YYYY-MM-DD"
  label: string; // "Today" | "Tomorrow" | "Fri 17"
}

function buildUpcomingDays(): UpcomingDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = toLocalISODate(d);
    if (i === 0) return { date: iso, label: "Today" };
    if (i === 1) return { date: iso, label: "Tomorrow" };
    const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
    return { date: iso, label: `${weekday} ${d.getDate()}` };
  });
}

// Format an ISO date string as "Wed May 7" for the custom-date pill.
// Uses UTC noon to dodge any DST / timezone shenanigans that would
// otherwise push a boundary date to the previous day.
function formatCustomDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${month} ${d.getDate()}`;
}

// Build a local-time ISO date ("YYYY-MM-DD") without UTC shift — using
// `toISOString().split("T")[0]` on a local Date can roll the day back
// one when the user is west of UTC, which matters for "today".
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface WhenStepProps {
  initialDay?: string;
  initialDuration?: Duration;
  onContinue: (day: string, duration: Duration) => void;
}

export function WhenStep({
  initialDay,
  initialDuration,
  onContinue,
}: WhenStepProps) {
  const days = useMemo(() => buildUpcomingDays(), []);

  const [day, setDay] = useState<string>(() => initialDay ?? days[0].date);
  const [duration, setDuration] = useState<Duration>(
    initialDuration ?? DEFAULT_DURATION
  );

  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // A "custom" date is any selection that isn't one of the first 7
  // pills. Keeping this derived (rather than a separate state) means
  // picking Today/Tomorrow after a custom date just works — the 8th
  // pill flips back to "+ Pick a date" on its own.
  const builtInDates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const customSelected = !builtInDates.has(day);

  const todayISO = days[0].date;

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    // showPicker is the modern way to summon the native date popover
    // on a button press without relying on the input being visible.
    // Falls back to click for older browsers.
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // fallthrough
      }
    }
    el.click();
  };

  const handleDatePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) return;
    setDay(value);
  };

  const TIME_BLOCKS = [
    { id: "morning", label: "Morning", description: "8am – 12pm" },
    { id: "afternoon", label: "Afternoon", description: "12 – 5pm" },
    { id: "evening", label: "Evening", description: "5 – 10pm" },
    { id: "late_night", label: "Late Night", description: "10pm – 2am" },
  ] as const;

  const [timeBlocks, setTimeBlocks] = useState<Set<string>>(new Set(["evening"]));

  const toggleTimeBlock = (id: string) => {
    setTimeBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const pillClassFor = (selected: boolean) =>
    `rounded-full px-4 py-2 text-sm font-sans font-medium transition-all border ${
      selected
        ? "bg-burgundy text-cream border-transparent"
        : "bg-cream border-border text-charcoal hover:border-charcoal/40"
    }`;

  return (
    <div>
      {/* ── When ────────────────────────────────────────────── */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3 text-center">
        When
      </h3>
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {days.map((d, i) => {
          const isSelected = day === d.date;
          return (
            <motion.button
              key={d.date}
              onClick={() => setDay(d.date)}
              className={pillClassFor(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {d.label}
            </motion.button>
          );
        })}

        {/* Custom-date pill — 8th slot. Displays the picked date when
            set, otherwise "+ Pick a date". Native <input type="date">
            is offscreen but focusable; tapping the pill summons it. */}
        <motion.button
          key="custom-date"
          type="button"
          onClick={openDatePicker}
          className={pillClassFor(customSelected)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: days.length * 0.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {customSelected ? formatCustomDate(day) : "+ Pick a date"}
        </motion.button>
        <input
          ref={dateInputRef}
          type="date"
          min={todayISO}
          value={customSelected ? day : ""}
          onChange={handleDatePicked}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      </div>

      {/* ── Time of Day ──────────────────────────────────────── */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3 text-center">
        Time of day
      </h3>
      <div className="flex flex-wrap justify-center gap-2 mb-10">
        {TIME_BLOCKS.map((block, i) => {
          const isSelected = timeBlocks.has(block.id);
          return (
            <motion.button
              key={block.id}
              onClick={() => toggleTimeBlock(block.id)}
              className={pillClassFor(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 + 0.05 }}
              whileTap={{ scale: 0.97 }}
            >
              {block.label}
              <span className={`ml-1.5 text-xs ${isSelected ? "text-cream/70" : "text-muted"}`}>
                {block.description}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* ── Duration ────────────────────────────────────────── */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3 text-center">
        For how long
      </h3>
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {DURATIONS.map((opt, i) => {
          const isSelected = duration === opt.id;
          return (
            <motion.button
              key={opt.id}
              onClick={() => setDuration(opt.id)}
              className={pillClassFor(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 + 0.1 }}
              whileTap={{ scale: 0.97 }}
            >
              {opt.label}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => onContinue(day, duration)}
          className="w-full"
        >
          Build my night
        </Button>
      </div>
    </div>
  );
}
