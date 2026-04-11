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
  month: string;
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
          : d.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString("en-US", { month: "short" }),
    };
  });
}

export default function DayStep({ selectedValue, onSelect }: DayStepProps) {
  const days = buildUpcomingDays();

  return (
    <div className="grid grid-cols-4 gap-2">
      {days.map((day, i) => {
        const isSelected = selectedValue === day.date;
        return (
          <motion.button
            key={day.date}
            onClick={() => onSelect(day.date)}
            className={`p-3 rounded-xl border-2 text-center transition-all ${
              isSelected
                ? "border-burgundy bg-burgundy/5"
                : "border-border bg-white hover:border-burgundy/30"
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            whileTap={{ scale: 0.96 }}
          >
            <div className="font-sans text-[10px] uppercase tracking-wide text-warm-gray">
              {day.dayName}
            </div>
            <div className="font-serif text-xl text-charcoal mt-0.5">{day.dayNum}</div>
            <div className="font-sans text-[10px] text-warm-gray">{day.month}</div>
          </motion.button>
        );
      })}
    </div>
  );
}
