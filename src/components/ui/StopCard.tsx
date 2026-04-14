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

  // Right-side meta tags — status info that complements the price.
  const metaTags: string[] = [];
  metaTags.push(stop.is_fixed ? "Fixed" : "Flexible");
  if (bookAhead) metaTags.push("Book ahead");
  if (cashOnly) metaTags.push("Cash only");

  return (
    <motion.div
      className="py-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
    >
      {/* Role label */}
      <div className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
        {ROLE_LABELS[stop.role]}
      </div>

      {/* Venue name — primary information, strongest on the page */}
      <h3 className="font-serif text-2xl font-normal text-charcoal mb-1 leading-snug">
        {activeVenue.name}
      </h3>

      {/* Category · Neighborhood */}
      <p className="font-sans text-sm text-muted mb-4">
        {activeVenue.category} &middot; {neighborhoodLabel(activeVenue.neighborhood)}
      </p>

      {/* Curation note — the reason this venue is here */}
      <p className="font-sans text-[15px] text-[#444444] leading-relaxed mb-5">
        {activeNote}
      </p>

      {/* Meta row: price + actions on the left, status tags on the right */}
      <div className="flex items-start justify-between gap-4 font-sans">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-charcoal">
            {stop.spend_estimate}
          </span>

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

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted shrink-0 pt-0.5">
          {metaTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
