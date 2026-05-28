"use client";

// Combined day + time block step. Outputs { day, timeBlock } via
// onContinue. The API route resolves timeBlock → concrete
// startTime/endTime before scoring runs.

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { pillClass } from "@/lib/styles";
import {
  TIME_BLOCKS,
  DEFAULT_TIME_BLOCK,
  formatBlockChipLabel,
} from "@/lib/itinerary/time-blocks";
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

  const builtInDates = useMemo(() => new Set(days.map((d) => d.date)), [days]);
  const customSelected = !builtInDates.has(day);
  const todayISO = days[0].date;

  const handleDatePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) return;
    setDay(value);
  };

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

        {/* Custom date pill — the <input type="date"> is layered on top
            of the visual pill at opacity 0 so a direct tap lands on the
            input itself. iOS Safari opens the native picker only on a
            trusted gesture on a real date input; proxying via a button
            and showPicker()/click() does not work there. */}
        <motion.label
          key="custom-date"
          htmlFor="custom-date-input"
          className="relative inline-block cursor-pointer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: days.length * 0.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <span className={pillClass(customSelected)} aria-hidden>
            {customSelected ? formatCustomDate(day) : "+ Pick a date"}
          </span>
          <input
            id="custom-date-input"
            type="date"
            min={todayISO}
            value={customSelected ? day : ""}
            onChange={handleDatePicked}
            onClick={(e) => {
              // Desktop browsers don't auto-open the picker on a click that lands
              // on the input's bounding box (only on the calendar icon, which
              // appearance:none strips). showPicker() bridges that — requires user
              // activation, which onClick provides. iOS Safari opens the picker
              // natively before this fires; the call may then throw or no-op,
              // either way harmless.
              try {
                e.currentTarget.showPicker?.();
              } catch {
                // iOS may throw NotAllowedError when picker is already open. Ignore.
              }
            }}
            aria-label="Pick a date"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none bg-transparent"
          />
        </motion.label>
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
              {formatBlockChipLabel(block.id)}
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
          Build my plan
        </Button>
      </div>
    </div>
  );
}
