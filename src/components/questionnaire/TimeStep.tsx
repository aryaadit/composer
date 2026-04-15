"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";

const ITEM_HEIGHT = 36;
const VISIBLE_ABOVE = 2;
const VISIBLE_BELOW = 2;
const COLUMN_HEIGHT = ITEM_HEIGHT * (VISIBLE_ABOVE + 1 + VISIBLE_BELOW); // 5 rows

// 30-minute slots across all 24 hours, starting at midnight.
function buildSlots(): string[] {
  const slots: string[] = [];
  for (let m = 0; m < 24 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

function format12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 && h < 24 ? "PM" : "AM";
  const display = h % 12 || 12;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function slotMinutes(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
}

function minutesToSlot(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 7pm is the modal date-night start. Only override when the user picked
// "Tonight" and it's already past 7pm — then jump to the next 30-min slot.
function defaultStartTime(allSlots: string[], selectedDay?: string): string {
  const PREFERRED = "19:00";
  if (!selectedDay) return PREFERRED;
  const todayISO = new Date().toISOString().split("T")[0];
  if (selectedDay !== todayISO) return PREFERRED;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins < 19 * 60) return PREFERRED;
  // Round up to the next 30-min boundary.
  const nextMins = Math.ceil(nowMins / 30) * 30;
  if (nextMins >= 24 * 60) return allSlots[allSlots.length - 1];
  return minutesToSlot(nextMins);
}

interface DurationPreset {
  label: string;
  minutes: number | null; // null = Open-ended
}

const OPEN_ENDED_MIN = 360; // 6h — what "Open-ended" resolves to for the API

const DURATION_PRESETS: DurationPreset[] = [
  { label: "Keep it short", minutes: 120 },
  { label: "Enjoy the moment", minutes: 240 },
  { label: "Open-ended", minutes: null },
];

const DEFAULT_DURATION_MIN: number = 240;

function computeEndTime(start: string, minutes: number | null): string {
  const target = slotMinutes(start) + (minutes ?? OPEN_ENDED_MIN);
  return minutesToSlot(target);
}

function closestPreset(minutes: number): number {
  const finite = DURATION_PRESETS.filter((p) => p.minutes !== null).map(
    (p) => p.minutes as number
  );
  return finite.reduce((best, cur) =>
    Math.abs(cur - minutes) < Math.abs(best - minutes) ? cur : best
  );
}

function deriveDurationMin(
  initialStart: string | undefined,
  initialEnd: string | undefined
): number | null {
  if (!initialStart || !initialEnd) return DEFAULT_DURATION_MIN;
  let diff = slotMinutes(initialEnd) - slotMinutes(initialStart);
  if (diff < 0) diff += 24 * 60; // wrap past midnight
  if (diff >= OPEN_ENDED_MIN) return null;
  return closestPreset(diff);
}

interface TimeColumnProps {
  label: string;
  slots: string[];
  selected: string;
  onSelect: (value: string) => void;
}

function TimeColumn({ label, slots, selected, onSelect }: TimeColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIdx = Math.max(0, slots.indexOf(selected));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: selectedIdx * ITEM_HEIGHT,
      behavior: "smooth",
    });
  }, [selectedIdx]);

  return (
    <div className="flex flex-col items-center">
      <span className="font-sans text-xs uppercase tracking-widest text-muted mb-3">
        {label}
      </span>
      <div
        className="relative"
        style={{
          width: 140,
          height: COLUMN_HEIGHT,
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%)",
        }}
      >
        <div
          ref={containerRef}
          className="h-full overflow-y-auto no-scrollbar"
          style={{
            scrollSnapType: "y mandatory",
            overscrollBehavior: "contain",
          }}
        >
          {Array.from({ length: VISIBLE_ABOVE }).map((_, i) => (
            <div key={`pad-top-${i}`} style={{ height: ITEM_HEIGHT }} />
          ))}
          {slots.map((slot) => {
            const isSelected = slot === selected;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onSelect(slot)}
                style={{
                  height: ITEM_HEIGHT,
                  scrollSnapAlign: "start",
                }}
                className="w-full flex items-center justify-center font-sans text-sm transition-colors"
              >
                <span
                  className={
                    isSelected
                      ? "font-medium text-charcoal border-b-2 border-charcoal pb-0.5"
                      : "text-muted hover:text-charcoal"
                  }
                >
                  {format12h(slot)}
                </span>
              </button>
            );
          })}
          {Array.from({ length: VISIBLE_BELOW }).map((_, i) => (
            <div key={`pad-bot-${i}`} style={{ height: ITEM_HEIGHT }} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TimeStepProps {
  initialStart?: string;
  initialEnd?: string;
  selectedDay?: string;
  onContinue: (startTime: string, endTime: string) => void;
}

export function TimeStep({
  initialStart,
  initialEnd,
  selectedDay,
  onContinue,
}: TimeStepProps) {
  const allSlots = buildSlots();

  const [startTime, setStartTime] = useState<string>(
    initialStart && allSlots.includes(initialStart)
      ? initialStart
      : defaultStartTime(allSlots, selectedDay)
  );
  const [durationMin, setDurationMin] = useState<number | null>(() =>
    deriveDurationMin(initialStart, initialEnd)
  );

  const selectedPreset = DURATION_PRESETS.find((p) => p.minutes === durationMin);
  const endTime = computeEndTime(startTime, durationMin);
  const isValid = selectedPreset !== undefined;

  const durationLabel = selectedPreset?.label ?? "";

  return (
    <div className="flex flex-col gap-8">
      {/* Start time — scroll wheel */}
      <div className="flex justify-center">
        <TimeColumn
          label="Starting at"
          slots={allSlots}
          selected={startTime}
          onSelect={setStartTime}
        />
      </div>

      {/* Duration — pills */}
      <div>
        <h3 className="text-center font-sans text-xs font-medium tracking-widest uppercase text-muted mb-3">
          For
        </h3>
        <div className="flex flex-wrap justify-center gap-2">
          {DURATION_PRESETS.map((preset, i) => {
            const isSelected = preset.minutes === durationMin;
            return (
              <motion.button
                key={preset.label}
                onClick={() => setDurationMin(preset.minutes)}
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
                {preset.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {isValid && (
        <div className="text-center">
          <span className="font-sans text-xs tracking-widest uppercase text-muted">
            {durationLabel}
          </span>
        </div>
      )}

      <Button
        variant="primary"
        onClick={() => onContinue(startTime, endTime)}
        disabled={!isValid}
        className="w-full"
      >
        Build my night
      </Button>
    </div>
  );
}
