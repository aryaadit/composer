"use client";

// Shown above the stop list when the itinerary's day is in the past.
// Muted/info tone — not destructive. Renders nothing if `day` is empty
// or in the future; the caller should still gate `isPast` upstream but
// this keeps the component idempotent for safety.

import { formatPastDateLabel } from "@/lib/dateUtils";

interface PastItineraryBannerProps {
  day: string | undefined | null;
}

export function PastItineraryBanner({ day }: PastItineraryBannerProps) {
  const label = formatPastDateLabel(day);
  return (
    <div
      role="note"
      className="w-full max-w-lg mx-auto mt-4 mb-2 px-4 py-3 rounded-lg border border-border bg-cream-dark/40"
    >
      <p className="font-sans text-sm text-warm-gray leading-relaxed">
        This itinerary was for {label || "a past date"}. Reservations and times
        shown may no longer be accurate.
      </p>
    </div>
  );
}
