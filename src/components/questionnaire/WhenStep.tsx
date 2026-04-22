"use client";

// Combined day + time block step. Outputs { day, timeBlock } via
// onContinue. The API route resolves timeBlock → concrete
// startTime/endTime before scoring runs.

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { TIME_BLOCKS, DEFAULT_TIME_BLOCK } from "@/config/time-blocks";
import type { TimeBlock } from "@/types";

interface UpcomingDay {
  date: string;
  label: string;
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

function formatCustomDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${month} ${d.getDate()}`;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface WhenStepProps {
  initialDay?: string;
  initialTimeBlock?: TimeBlock;
  onContinue: (day: string, timeBlock: TimeBlock) => void;
}

export function WhenStep({
  initialDay,
  initialTimeBlock,
  onContinue,
}: WhenStepProps) {
  const days = useMemo(() => buildUpcomingDays(), []);

  const [day, setDay] = useState<string>(() => initialDay ?? days[0].date);
  const [timeBlock, setTimeBlock] = useState<TimeBlock>(
    initialTimeBlock ?? DEFAULT_TIME_BLOCK
  );

  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const builtInDates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const customSelected = !builtInDates.has(day);
  const todayISO = days[0].date;

  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
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

  const pillClass = (selected: boolean) =>
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
              className={pillClass(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {d.label}
            </motion.button>
          );
        })}

        <motion.button
          key="custom-date"
          type="button"
          onClick={openDatePicker}
          className={pillClass(customSelected)}
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

      {/* ── Time ────────────────────────────────────────────── */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3 text-center">
        Time
      </h3>
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {TIME_BLOCKS.map((block, i) => {
          const isSelected = timeBlock === block.id;
          return (
            <motion.button
              key={block.id}
              onClick={() => setTimeBlock(block.id)}
              className={pillClass(isSelected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 + 0.1 }}
              whileTap={{ scale: 0.97 }}
            >
              {block.pillLabel}
            </motion.button>
          );
        })}
      </div>

      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => onContinue(day, timeBlock)}
          className="w-full"
        >
          Build my night
        </Button>
      </div>
    </div>
  );
}
