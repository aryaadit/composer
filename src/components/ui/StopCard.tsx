"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ItineraryStop } from "@/types";
import { ROLE_LABELS } from "@/config/roles";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { detectBookingPlatform } from "@/lib/booking";

// Venues with reservation_difficulty >= this get a "Book ahead" hint.
// 3 = "medium hard to book" on Reid's 1-4 scale (tier 3 = book 1-2 weeks
// ahead, tier 4 = 3+ weeks ahead for places like Eleven Madison Park).
const BOOK_AHEAD_THRESHOLD = 3;

export function StopCard({
  stop,
  index,
}: {
  stop: ItineraryStop;
  index: number;
}) {
  const [showPlanB, setShowPlanB] = useState(false);
  const activeVenue = showPlanB && stop.plan_b ? stop.plan_b : stop.venue;
  const activeNote =
    showPlanB && stop.plan_b ? stop.plan_b.curation_note : stop.curation_note;

  const bookAhead =
    (activeVenue.reservation_difficulty ?? 0) >= BOOK_AHEAD_THRESHOLD;
  const cashOnly = activeVenue.cash_only === true;
  const bookingPlatform = detectBookingPlatform(activeVenue.reservation_url);

  return (
    <motion.div
      className="py-7"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
    >
      {/* Role label */}
      <div className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
        {ROLE_LABELS[stop.role]}
      </div>

      {/* Venue name */}
      <h3 className="font-serif text-xl font-normal text-charcoal mb-1 leading-snug">
        {activeVenue.name}
      </h3>

      {/* Category · Neighborhood */}
      <p className="font-sans text-sm text-muted mb-3">
        {activeVenue.category} &middot; {neighborhoodLabel(activeVenue.neighborhood)}
      </p>

      {/* Curation note */}
      <p className="font-sans text-sm text-warm-gray leading-relaxed mb-4">
        {activeNote}
      </p>

      {/* Meta row: price · reserve · plan B */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-sm">
        <span className="text-charcoal">{stop.spend_estimate}</span>

        {bookingPlatform && activeVenue.reservation_url && (
          <a
            href={activeVenue.reservation_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-burgundy hover:text-burgundy-light transition-colors"
          >
            {bookingPlatform.label}
          </a>
        )}

        {!stop.is_fixed && stop.plan_b && (
          <button
            onClick={() => setShowPlanB(!showPlanB)}
            className="text-burgundy hover:text-burgundy-light transition-colors"
          >
            {showPlanB ? "Back to original" : "Plan B"}
          </button>
        )}
      </div>

      {/* Quiet badges — plain text, no chips */}
      {(stop.is_fixed || !stop.is_fixed || bookAhead || cashOnly) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 font-sans text-xs text-muted">
          <span>{stop.is_fixed ? "Fixed" : "Flexible"}</span>
          {bookAhead && <span>Book ahead</span>}
          {cashOnly && <span>Cash only</span>}
        </div>
      )}
    </motion.div>
  );
}
