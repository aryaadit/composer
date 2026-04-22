"use client";

// Soft validation banner — shows when selected slot times are out of
// itinerary order (e.g., dessert before dinner). Advisory only; does
// not block booking.

import { formatSlotTimeForDisplay } from "@/lib/itinerary/time-blocks";
import type { ItineraryStop } from "@/types";
import type { AvailabilitySlot } from "@/lib/availability/resy";

export interface OrderingConflict {
  earlierStopIndex: number;
  laterStopIndex: number;
  earlierVenueName: string;
  laterVenueName: string;
  earlierTime: string;
  laterTime: string;
}

function extractMinutes(slotTime: string): number {
  const timePart = slotTime.includes(" ")
    ? slotTime.split(" ")[1].substring(0, 5)
    : slotTime.substring(0, 5);
  const [h, m] = timePart.split(":").map(Number);
  // Treat 00:00–05:59 as next-day (add 24h) for midnight-wrap ordering
  const adjusted = h < 6 ? h + 24 : h;
  return adjusted * 60 + m;
}

export function detectOrderingConflict(
  stops: ItineraryStop[],
  selectedSlots: Record<string, AvailabilitySlot>
): OrderingConflict | null {
  const withSlots = stops
    .map((stop, i) => ({
      index: i,
      name: stop.venue.name,
      slot: selectedSlots[stop.venue.id],
    }))
    .filter((s) => s.slot);

  for (let i = 0; i < withSlots.length - 1; i++) {
    const earlier = withSlots[i];
    const later = withSlots[i + 1];
    const earlierMin = extractMinutes(earlier.slot!.time);
    const laterMin = extractMinutes(later.slot!.time);

    if (laterMin < earlierMin) {
      return {
        earlierStopIndex: earlier.index,
        laterStopIndex: later.index,
        earlierVenueName: earlier.name,
        laterVenueName: later.name,
        earlierTime: formatSlotTimeForDisplay(earlier.slot!.time),
        laterTime: formatSlotTimeForDisplay(later.slot!.time),
      };
    }
  }
  return null;
}

interface OrderingConflictBannerProps {
  conflict: OrderingConflict;
  onSwap: () => void;
  onDismiss: () => void;
}

export function OrderingConflictBanner({
  conflict,
  onSwap,
  onDismiss,
}: OrderingConflictBannerProps) {
  return (
    <div className="w-full max-w-lg mx-auto mb-4 px-4 py-3 rounded-xl border border-border bg-cream-dark font-sans text-sm text-charcoal">
      <p>
        Heads up — your {conflict.laterVenueName} (
        {conflict.laterTime}) is before your{" "}
        {conflict.earlierVenueName} ({conflict.earlierTime}).
      </p>
      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onSwap}
          className="text-burgundy font-medium hover:text-burgundy-light transition-colors text-xs"
        >
          Swap times
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted hover:text-charcoal transition-colors text-xs"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
