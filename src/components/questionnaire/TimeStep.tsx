"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Button from "@/components/ui/Button";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

function buildSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

function format12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const display = h % 12 || 12;
  return `${display}:${String(m).padStart(2, "0")} ${period}`;
}

function defaultStartTime(): string {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const rounded = Math.ceil(mins / 15) * 15 + 60; // 1 hr from now
  const h = Math.floor(rounded / 60) % 24;
  const m = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function defaultEndTime(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const end = h * 60 + m + 180; // +3 hours
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

interface WheelColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function WheelColumn({ items, selectedIndex, onSelect }: WheelColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = selectedIndex * ITEM_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = useCallback(() => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: "smooth" });
      onSelect(clamped);
    }, 80);
  }, [items.length, onSelect]);

  const padCount = Math.floor(VISIBLE_ITEMS / 2);

  return (
    <div className="relative" style={{ height: WHEEL_HEIGHT, width: 130 }}>
      {/* Selection band */}
      <div
        className="absolute left-0 right-0 rounded-xl pointer-events-none z-10 bg-burgundy/10"
        style={{ top: padCount * ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
      {/* Top fade */}
      <div
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
        style={{
          height: ITEM_HEIGHT * 1.5,
          background: "linear-gradient(to bottom, #FAF8F5 10%, transparent)",
        }}
      />
      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{
          height: ITEM_HEIGHT * 1.5,
          background: "linear-gradient(to top, #FAF8F5 10%, transparent)",
        }}
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll no-scrollbar"
        style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
      >
        {Array.from({ length: padCount }).map((_, i) => (
          <div key={`pad-top-${i}`} style={{ height: ITEM_HEIGHT }} />
        ))}
        {items.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={i}
              onClick={() => {
                const el = containerRef.current;
                if (el) el.scrollTo({ top: i * ITEM_HEIGHT, behavior: "smooth" });
                onSelect(i);
              }}
              className="flex items-center justify-center cursor-pointer select-none transition-all font-serif"
              style={{
                height: ITEM_HEIGHT,
                scrollSnapAlign: "start",
                fontWeight: isSelected ? 700 : 400,
                fontSize: isSelected ? 22 : 17,
                color: isSelected ? "#6B1E2E" : "#9A9A9A",
              }}
            >
              {item}
            </div>
          );
        })}
        {Array.from({ length: padCount }).map((_, i) => (
          <div key={`pad-bot-${i}`} style={{ height: ITEM_HEIGHT }} />
        ))}
      </div>
    </div>
  );
}

interface TimeStepProps {
  initialStart?: string;
  initialEnd?: string;
  onContinue: (startTime: string, endTime: string) => void;
}

export default function TimeStep({ initialStart, initialEnd, onContinue }: TimeStepProps) {
  const allSlots = buildSlots();
  const [startTime, setStartTime] = useState<string>(initialStart || defaultStartTime());
  const [endTime, setEndTime] = useState<string>(
    initialEnd || defaultEndTime(initialStart || defaultStartTime())
  );

  const startDisplaySlots = allSlots.map(format12h);
  const endSlotsRaw = allSlots.filter((s) => s > startTime);
  const endDisplaySlots = endSlotsRaw.map(format12h);

  const startIdx = Math.max(0, allSlots.indexOf(startTime));
  const endIdx = Math.max(0, endSlotsRaw.indexOf(endTime));

  const handleStartSelect = (idx: number) => {
    const t = allSlots[idx];
    setStartTime(t);
    // If new start >= current end, bump end by 2 hours
    if (t >= endTime) {
      const [h, m] = t.split(":").map(Number);
      const end = h * 60 + m + 120;
      const eh = Math.floor(end / 60) % 24;
      const em = end % 60;
      setEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
    }
  };

  const handleEndSelect = (idx: number) => {
    setEndTime(endSlotsRaw[idx]);
  };

  // Compute duration label
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const diffMin = eh * 60 + em - (sh * 60 + sm);
  const hrs = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  const durationLabel = `${hrs > 0 ? `${hrs}h` : ""}${mins > 0 ? ` ${mins}m` : ""}`.trim();
  const isValid = diffMin > 0;

  return (
    <div>
      <div className="flex items-center justify-center gap-4">
        <div className="flex flex-col items-center">
          <span className="font-sans text-xs uppercase tracking-wider text-warm-gray mb-2">
            Start
          </span>
          <WheelColumn
            items={startDisplaySlots}
            selectedIndex={startIdx}
            onSelect={handleStartSelect}
          />
        </div>
        <span className="font-serif text-2xl text-warm-gray mt-7">→</span>
        <div className="flex flex-col items-center">
          <span className="font-sans text-xs uppercase tracking-wider text-warm-gray mb-2">
            End
          </span>
          <WheelColumn
            items={endDisplaySlots}
            selectedIndex={endIdx}
            onSelect={handleEndSelect}
          />
        </div>
      </div>

      {isValid && (
        <div className="text-center mt-4">
          <span className="inline-block px-4 py-1.5 rounded-full text-sm font-sans font-medium bg-burgundy/10 text-burgundy">
            {durationLabel} window
          </span>
        </div>
      )}

      <div className="flex justify-center mt-6">
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
