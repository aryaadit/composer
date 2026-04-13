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
    <div className="flex flex-wrap justify-center gap-2">
      {days.map((day, i) => {
        const isSelected = selectedValue === day.date;
        return (
          <motion.button
            key={day.date}
            onClick={() => onSelect(day.date)}
            className={`rounded-full px-4 py-2 text-sm font-sans font-medium transition-all border ${
              isSelected
                ? "bg-burgundy text-cream border-burgundy"
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
