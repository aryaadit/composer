'use client';

import { useMemo } from 'react';
import { Calendar, Clock, MapPin } from 'lucide-react';

/**
 * NextUpWidget — surfaces the soonest upcoming saved plan.
 *
 * Reads `meta.date` (ISO yyyy-mm-dd) + `meta.startTime` from every plan,
 * filters to today-or-later, sorts ascending, and highlights the top one.
 * If nothing is upcoming, renders a friendly empty state.
 */
export default function NextUpWidget({ plans = [] }) {
  const upcoming = useMemo(() => {
    const now = new Date();
    // Today at 00:00 local so we include plans scheduled for later today.
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    const enriched = plans
      .map((p) => {
        const dateStr = p?.meta?.date;
        if (!dateStr) return null;
        const startTime = p?.meta?.startTime || '19:00';
        const when = parseLocalDateTime(dateStr, startTime);
        if (!when) return null;
        return { plan: p, when };
      })
      .filter((x) => x && x.when.getTime() >= startOfToday);

    enriched.sort((a, b) => a.when.getTime() - b.when.getTime());
    return enriched[0] || null;
  }, [plans]);

  if (!upcoming) {
    return (
      <div className="rounded-2xl border border-[#ececec] bg-white px-4 py-5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={16} className="text-[var(--muted)]" />
          <div className="text-sm font-semibold">Next up</div>
        </div>
        <div className="text-sm text-[var(--muted)]">
          No upcoming dates saved yet. When you save a plan with a date, it will show up here.
        </div>
      </div>
    );
  }

  const { plan, when } = upcoming;
  const stops = Array.isArray(plan?.itinerary) ? plan.itinerary : [];
  const firstStop = stops[0] || null;
  const countdown = formatCountdown(when);
  const dayLabel = when.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const timeLabel = when.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  const vibe = plan?.meta?.vibe || plan?.vibeEmoji || '';

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#fff1e0] to-[#ffe2c4] border border-[#ffd89b] px-4 py-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-[#7a4a00]" />
          <div className="text-xs font-semibold tracking-widest text-[#7a4a00]">
            NEXT UP · {countdown}
          </div>
        </div>
        {plan?.vibeEmoji && <div className="text-xl">{plan.vibeEmoji}</div>}
      </div>

      <div className="serif text-xl text-[#2b1400] mb-1">
        {firstStop?.name || 'Your next date'}
      </div>
      {stops.length > 1 && (
        <div className="text-sm text-[#7a4a00] mb-3">
          + {stops.length - 1} more {stops.length - 1 === 1 ? 'stop' : 'stops'}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-[#7a4a00]">
        <div className="flex items-center gap-1">
          <Calendar size={12} /> {dayLabel}
        </div>
        <div className="flex items-center gap-1">
          <Clock size={12} /> {timeLabel}
        </div>
        {firstStop?.neighborhood && (
          <div className="flex items-center gap-1">
            <MapPin size={12} /> {firstStop.neighborhood}
          </div>
        )}
      </div>
    </div>
  );
}

function parseLocalDateTime(dateStr, timeStr) {
  // Build a Date in the user's local zone — avoid `new Date("yyyy-mm-dd")`
  // which is interpreted as UTC midnight and can slip a day backward.
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh = 19, mm = 0] = (timeStr || '19:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function formatCountdown(when) {
  const now = Date.now();
  const ms = when.getTime() - now;
  if (ms < 0) return 'happening now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hr`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return 'next week';
  return `in ${weeks} weeks`;
}
