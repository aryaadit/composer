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

interface WeekGroup {
  label: string;
  days: UpcomingDay[];
}

const TOTAL_DAYS = 30;
const DAYS_PER_WEEK = 7;

function formatPillLabel(
  d: Date,
  offset: number,
  weekStartMonth: number
): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  const weekday = d
    .toLocaleDateString("en-US", { weekday: "short" })
    .toUpperCase();
  // If this day's month differs from the week's first-day month, include
  // the short month so the pill isn't ambiguous (e.g. "WED May 3" inside
  // a row labeled "Week of Apr 28").
  if (d.getMonth() !== weekStartMonth) {
    const month = d.toLocaleDateString("en-US", { month: "short" });
    return `${weekday} ${month}`;
  }
  return weekday;
}

function buildWeekGroups(): WeekGroup[] {
  const today = new Date();
  const groups: WeekGroup[] = [];

  for (let w = 0; w * DAYS_PER_WEEK < TOTAL_DAYS; w++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + w * DAYS_PER_WEEK);
    const weekStartMonth = weekStart.getMonth();

    const days: UpcomingDay[] = [];
    for (let i = 0; i < DAYS_PER_WEEK; i++) {
      const offset = w * DAYS_PER_WEEK + i;
      if (offset >= TOTAL_DAYS) break;
      const d = new Date(today);
      d.setDate(today.getDate() + offset);
      days.push({
        date: d.toISOString().split("T")[0],
        dayName: formatPillLabel(d, offset, weekStartMonth),
        dayNum: d.getDate(),
      });
    }

    let label: string;
    if (w === 0) label = "This week";
    else if (w === 1) label = "Next week";
    else {
      const monthDay = weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      label = `Week of ${monthDay}`;
    }

    groups.push({ label, days });
  }

  return groups;
}

export function DayStep({ selectedValue, onSelect }: DayStepProps) {
  const groups = buildWeekGroups();
  let delayIndex = 0;

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="text-center font-sans text-xs font-medium tracking-widest uppercase text-muted mb-3">
            {group.label}
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {group.days.map((day) => {
              const isSelected = selectedValue === day.date;
              const i = delayIndex++;
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
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  {day.dayName} {day.dayNum}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
