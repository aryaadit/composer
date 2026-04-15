"use client";

// Combined day + duration step. Replaces the old separate DayStep + TimeStep.
//
// Outputs `{ day, duration }` via onContinue. The API route resolves
// duration → concrete startTime/endTime before the rest of the pipeline
// runs, so `planStopMix` and friends stay unchanged.

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { DURATIONS, DEFAULT_DURATION } from "@/config/durations";
import type { Duration } from "@/types";

interface UpcomingDay {
  date: string; // ISO
  label: string; // "Today" | "Tomorrow" | "WED 16"
}

function buildUpcomingDays(): UpcomingDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split("T")[0];
    if (i === 0) return { date: iso, label: "Today" };
    if (i === 1) return { date: iso, label: "Tomorrow" };
    const weekday = d
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();
    return { date: iso, label: `${weekday} ${d.getDate()}` };
  });
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
  const days = buildUpcomingDays();

  const [day, setDay] = useState<string>(() => initialDay ?? days[0].date);
  const [duration, setDuration] = useState<Duration>(
    initialDuration ?? DEFAULT_DURATION
  );

  return (
    <div>
      {/* ── Day ─────────────────────────────────────────────── */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3 text-center">
        When
      </h3>
      <div className="flex flex-nowrap overflow-x-auto no-scrollbar gap-2 px-4 -mx-4 mb-10">
        {days.map((d, i) => {
          const isSelected = day === d.date;
          return (
            <motion.button
              key={d.date}
              onClick={() => setDay(d.date)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-sans font-medium transition-all border ${
                isSelected
                  ? "bg-burgundy text-cream border-transparent"
                  : "bg-cream border-border text-charcoal hover:border-charcoal/40"
              }`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {d.label}
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
              className={`rounded-full px-4 py-2 text-sm font-sans font-medium transition-all border ${
                isSelected
                  ? "bg-burgundy text-cream border-transparent"
                  : "bg-cream border-border text-charcoal hover:border-charcoal/40"
              }`}
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
