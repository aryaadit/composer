"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";

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

  // Bridge JS layout constants to CSS custom properties so Tailwind utilities
  // remain the single source of truth for visual properties below.
  const wheelVars = {
    "--wheel-item-h": `${ITEM_HEIGHT}px`,
    "--wheel-h": `${WHEEL_HEIGHT}px`,
    "--wheel-pad": `${padCount * ITEM_HEIGHT}px`,
    "--wheel-fade": `${ITEM_HEIGHT * 1.5}px`,
  } as React.CSSProperties;

  return (
    <div
      className="relative w-[130px] h-[var(--wheel-h)]"
      style={wheelVars}
    >
      {/* Selection band */}
      <div className="absolute left-0 right-0 top-[var(--wheel-pad)] h-[var(--wheel-item-h)] pointer-events-none z-10 border-y border-border" />
      {/* Top fade */}
      <div className="absolute top-0 left-0 right-0 h-[var(--wheel-fade)] z-20 pointer-events-none bg-gradient-to-b from-cream from-10% to-transparent" />
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-[var(--wheel-fade)] z-20 pointer-events-none bg-gradient-to-t from-cream from-10% to-transparent" />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll no-scrollbar [scroll-snap-type:y_mandatory]"
      >
        {Array.from({ length: padCount }).map((_, i) => (
          <div key={`pad-top-${i}`} className="h-[var(--wheel-item-h)]" />
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
              className={`flex items-center justify-center cursor-pointer select-none transition-all font-sans h-[var(--wheel-item-h)] [scroll-snap-align:start] ${
                isSelected
                  ? "font-medium text-[18px] text-charcoal"
                  : "font-normal text-[15px] text-muted"
              }`}
            >
              {item}
            </div>
          );
        })}
        {Array.from({ length: padCount }).map((_, i) => (
          <div key={`pad-bot-${i}`} className="h-[var(--wheel-item-h)]" />
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

export function TimeStep({ initialStart, initialEnd, onContinue }: TimeStepProps) {
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
          <span className="font-sans text-xs uppercase tracking-wider text-muted mb-2">
            Start
          </span>
          <WheelColumn
            items={startDisplaySlots}
            selectedIndex={startIdx}
            onSelect={handleStartSelect}
          />
        </div>
        <span className="font-sans text-xl text-muted mt-7">→</span>
        <div className="flex flex-col items-center">
          <span className="font-sans text-xs uppercase tracking-wider text-muted mb-2">
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
          <span className="font-sans text-xs tracking-widest uppercase text-muted">
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
