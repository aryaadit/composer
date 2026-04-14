"use client";

import { motion } from "motion/react";

interface DayStepProps {
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
}

interface UpcomingDay {
  date: string;
  dayName: string;
  dayNum: number;
}

function buildUpcomingDays(): UpcomingDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      date: d.toISOString().split("T")[0],
      dayName:
        i === 0
          ? "Today"
          : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      dayNum: d.getDate(),
    };
  });
}

export function DayStep({ selectedValue, onSelect }: DayStepProps) {
  const days = buildUpcomingDays();

  return (
    // Single horizontal row — never wraps. On narrow viewports the trailing
    // days slide off the right edge and the user scrolls; that's intentional
    // so SAT / SUN don't get orphaned on a second line.
    <div className="flex flex-nowrap overflow-x-auto no-scrollbar gap-2 px-4 -mx-4">
      {days.map((day, i) => {
        const isSelected = selectedValue === day.date;
        return (
          <motion.button
            key={day.date}
            onClick={() => onSelect(day.date)}
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
            {day.dayName} {day.dayNum}
          </motion.button>
        );
      })}
    </div>
  );
}
