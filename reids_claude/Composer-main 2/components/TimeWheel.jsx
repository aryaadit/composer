'use client';

import { useRef, useEffect, useCallback } from 'react';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

export default function TimeWheel({ value, onChange, minTime, label }) {
  const allSlots = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      allSlots.push(`${hh}:${mm}`);
    }
  }

  const slots = minTime
    ? allSlots.filter((s) => s > minTime)
    : allSlots;

  const selectedIndex = Math.max(0, slots.indexOf(value));

  return (
    <div className="flex flex-col items-center">
      {label && (
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          {label}
        </span>
      )}
      <WheelColumn
        items={slots.map((s) => format12h(s))}
        selectedIndex={selectedIndex}
        onSelect={(i) => onChange(slots[i])}
      />
    </div>
  );
}

function WheelColumn({ items, selectedIndex, onSelect }) {
  const containerRef = useRef(null);
  const isScrollingRef = useRef(false);
  const snapTimerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = selectedIndex * ITEM_HEIGHT;
  }, []);

  const handleScroll = useCallback(() => {
    clearTimeout(snapTimerRef.current);
    isScrollingRef.current = true;

    snapTimerRef.current = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      el.scrollTo({ top: clamped * ITEM_HEIGHT, behavior: 'smooth' });
      onSelect(clamped);
      isScrollingRef.current = false;
    }, 80);
  }, [items.length, onSelect]);

  const padCount = Math.floor(VISIBLE_ITEMS / 2);

  return (
    <div className="relative" style={{ height: WHEEL_HEIGHT, width: 140 }}>
      <div
        className="absolute left-0 right-0 rounded-xl pointer-events-none z-10"
        style={{
          top: padCount * ITEM_HEIGHT,
          height: ITEM_HEIGHT,
          background: 'var(--mango-primary)',
          opacity: 0.12,
        }}
      />
      <div
        className="absolute top-0 left-0 right-0 z-20 pointer-events-none"
        style={{
          height: ITEM_HEIGHT * 1.5,
          background: 'linear-gradient(to bottom, white 10%, transparent)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{
          height: ITEM_HEIGHT * 1.5,
          background: 'linear-gradient(to top, white 10%, transparent)',
        }}
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll no-scrollbar"
        style={{ scrollSnapType: 'y mandatory' }}
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
                if (el) el.scrollTo({ top: i * ITEM_HEIGHT, behavior: 'smooth' });
                onSelect(i);
              }}
              className="flex items-center justify-center cursor-pointer select-none transition-all"
              style={{
                height: ITEM_HEIGHT,
                scrollSnapAlign: 'start',
                fontWeight: isSelected ? 700 : 400,
                fontSize: isSelected ? 20 : 16,
                color: isSelected ? 'var(--mango-primary)' : '#999',
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

function format12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 || 12;
  return `${display}:${String(m).padStart(2, '0')} ${period}`;
}
