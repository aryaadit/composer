"use client";

// Inline booking-slot pills for a single venue. Fetches availability
// from /api/booking-slots on mount and whenever date or partySize
// changes. Renders Resy time pills as external links; for OpenTable
// (where slots are usually empty), shows a single deep-link CTA.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BookingAvailability } from "@/lib/bookingTypes";

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface BookingSlotsProps {
  venueId: string;
  initialDate?: string;
  initialPartySize?: number;
}

export function BookingSlots({
  venueId,
  initialDate,
  initialPartySize = 2,
}: BookingSlotsProps) {
  const [date, setDate] = useState(initialDate ?? tomorrow());
  const [partySize, setPartySize] = useState(initialPartySize);
  const [data, setData] = useState<BookingAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSlots = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(
        `/api/booking-slots?venueId=${venueId}&date=${date}&partySize=${partySize}`,
        { signal: ctrl.signal }
      );
      if (!res.ok) throw new Error();
      const json = (await res.json()) as BookingAvailability;
      if (!ctrl.signal.aborted) {
        setData(json);
        setLoading(false);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (!ctrl.signal.aborted) {
        setError(true);
        setLoading(false);
      }
    }
  }, [venueId, date, partySize]);

  useEffect(() => {
    void fetchSlots();
    return () => abortRef.current?.abort();
  }, [fetchSlots]);

  const platformBadge =
    data?.platform === "resy"
      ? "via Resy"
      : data?.platform === "opentable"
      ? "via OpenTable"
      : null;

  const hasSlots =
    data && data.groups.length > 0 && data.groups.some((g) => g.slots.length > 0);

  return (
    <div className="mt-4 rounded-2xl bg-burgundy/5 border border-border p-4">
      {/* Header: label + party size + date + platform badge */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="font-sans text-xs tracking-widest uppercase text-muted">
          Book
        </span>
        <select
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          className="font-sans text-xs bg-cream border border-border rounded-lg px-2 py-1 text-charcoal"
          aria-label="Party size"
        >
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          min={today()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="font-sans text-xs bg-cream border border-border rounded-lg px-2 py-1 text-charcoal"
          aria-label="Date"
        />
        {platformBadge && (
          <span className="font-sans text-[10px] text-muted ml-auto">
            {platformBadge}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex gap-2 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-16 rounded-lg bg-border"
            />
          ))}
        </div>
      )}

      {/* Slots */}
      {!loading && hasSlots && (
        <div className="space-y-3">
          {data!.groups.map((group) => {
            if (group.slots.length === 0) return null;
            return (
              <div key={group.serviceType}>
                {data!.groups.length > 1 && (
                  <p className="font-sans text-[10px] tracking-widest uppercase text-muted mb-1.5">
                    {group.serviceType}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {group.slots.map((slot) => (
                    <a
                      key={`${slot.time}-${slot.configId}`}
                      href={slot.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-burgundy/10 hover:bg-burgundy/20 px-3 py-2 text-sm font-sans font-semibold text-burgundy transition-colors"
                    >
                      {slot.time}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty / error — fallback CTA */}
      {!loading && !hasSlots && data?.fallbackUrl && (
        <a
          href={data.fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-burgundy/10 hover:bg-burgundy/20 px-4 py-2.5 text-sm font-sans font-semibold text-burgundy transition-colors"
        >
          Check {data.platform === "resy" ? "Resy" : data.platform === "opentable" ? "OpenTable" : ""} availability →
        </a>
      )}

      {/* Hard error — no data at all */}
      {!loading && error && !data?.fallbackUrl && (
        <p className="font-sans text-xs text-muted">
          Couldn&apos;t load availability.
        </p>
      )}
    </div>
  );
}
