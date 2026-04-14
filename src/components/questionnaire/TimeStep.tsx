"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

const ITEM_HEIGHT = 36;
const VISIBLE_ABOVE = 3;
const VISIBLE_BELOW = 2;
const COLUMN_HEIGHT = ITEM_HEIGHT * (VISIBLE_ABOVE + 1 + VISIBLE_BELOW); // 6 rows

// 30-minute slots from 5:00 PM (17:00) through 2:00 AM next day (26:00).
function buildSlots(): string[] {
  const slots: string[] = [];
  for (let m = 17 * 60; m <= 26 * 60; m += 30) {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

function format12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 || 12;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function defaultStartTime(allSlots: string[]): string {
  // Pick the slot closest to "now + 1 hour", clamped to the available range.
  const now = new Date();
  const targetMins = now.getHours() * 60 + now.getMinutes() + 60;
  const fallback = "19:00";
  let best = fallback;
  let bestDelta = Infinity;
  for (const slot of allSlots) {
    const [h, m] = slot.split(":").map(Number);
    const slotMins = h < 5 ? (h + 24) * 60 + m : h * 60 + m;
    const delta = Math.abs(slotMins - targetMins);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best;
}

function defaultEndTime(allSlots: string[], start: string): string {
  // 3 hours after start by default — typical evening window.
  const idx = allSlots.indexOf(start);
  const target = Math.min(idx + 6, allSlots.length - 1);
  return allSlots[target];
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

  // Center the selected row on mount and whenever the selection changes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: selectedIdx * ITEM_HEIGHT,
      behavior: "smooth",
    });
  }, [selectedIdx]);

  const padCount = VISIBLE_ABOVE;

  return (
    <div className="flex flex-col items-center">
      <span className="font-sans text-xs uppercase tracking-widest text-muted mb-3">
        {label}
      </span>
      <div
        className="relative"
        style={{
          width: 110,
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
          style={{ scrollSnapType: "y mandatory" }}
        >
          {Array.from({ length: padCount }).map((_, i) => (
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
  onContinue: (startTime: string, endTime: string) => void;
}

export function TimeStep({ initialStart, initialEnd, onContinue }: TimeStepProps) {
  const allSlots = buildSlots();
  const [startTime, setStartTime] = useState<string>(
    initialStart && allSlots.includes(initialStart)
      ? initialStart
      : defaultStartTime(allSlots)
  );
  const [endTime, setEndTime] = useState<string>(
    initialEnd && allSlots.includes(initialEnd)
      ? initialEnd
      : defaultEndTime(allSlots, initialStart || defaultStartTime(allSlots))
  );

  // End must come after start. If the user picks a start that's >= end,
  // bump end forward by 2 hours (or clamp to last slot).
  const handleStartSelect = (value: string) => {
    setStartTime(value);
    const sIdx = allSlots.indexOf(value);
    const eIdx = allSlots.indexOf(endTime);
    if (eIdx <= sIdx) {
      const bumped = Math.min(sIdx + 4, allSlots.length - 1);
      setEndTime(allSlots[bumped]);
    }
  };

  const endSlots = allSlots.filter((s) => allSlots.indexOf(s) > allSlots.indexOf(startTime));

  // Compute window duration label.
  const sIdx = allSlots.indexOf(startTime);
  const eIdx = allSlots.indexOf(endTime);
  const diffMin = (eIdx - sIdx) * 30;
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const durationLabel = `${hrs > 0 ? `${hrs}h` : ""}${mins > 0 ? ` ${mins}m` : ""}`.trim();
  const isValid = diffMin > 0;

  return (
    <div>
      <div className="flex items-center justify-center gap-6">
        <TimeColumn
          label="Start"
          slots={allSlots}
          selected={startTime}
          onSelect={handleStartSelect}
        />
        <span className="font-sans text-lg text-muted self-center mt-6">→</span>
        <TimeColumn
          label="End"
          slots={endSlots}
          selected={endTime}
          onSelect={setEndTime}
        />
      </div>

      {isValid && (
        <div className="text-center mt-6">
          <span className="font-sans text-xs tracking-widest uppercase text-muted">
            {durationLabel} window
          </span>
        </div>
      )}

      <div className="flex justify-center mt-8">
        <Button
          variant="primary"
          onClick={() => onContinue(startTime, endTime)}
          disabled={!isValid}
          className="px-10 py-3 text-sm"
        >
          Build my night
        </Button>
      </div>
    </div>
  );
}
