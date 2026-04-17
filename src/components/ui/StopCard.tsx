"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ItineraryStop } from "@/types";
import { ROLE_LABELS } from "@/config/roles";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { StopStatusBadge } from "@/components/ui/StopStatusBadge";
import { detectBookingPlatform } from "@/lib/booking";

const BOOK_AHEAD_THRESHOLD = 3;

interface StopCardProps {
  stop: ItineraryStop;
  index: number;
  onSwap?: () => void;
  isSwapping?: boolean;
  swapError?: string | null;
}

export function StopCard({
  stop,
  index,
  onSwap,
  isSwapping = false,
  swapError,
}: StopCardProps) {
  const [showPlanB, setShowPlanB] = useState(false);
  const activeVenue = showPlanB && stop.plan_b ? stop.plan_b : stop.venue;
  const activeNote =
    showPlanB && stop.plan_b ? stop.plan_b.curation_note : stop.curation_note;

  const bookAhead =
    (activeVenue.reservation_difficulty ?? 0) >= BOOK_AHEAD_THRESHOLD;
  const cashOnly = activeVenue.cash_only === true;
  const bookingPlatform = detectBookingPlatform(activeVenue.reservation_url);
  const statusKind = stop.is_fixed ? "fixed" : "flexible";

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

      {isSwapping ? (
        <SwapSkeleton />
      ) : (
        <>
          {/* Venue name */}
          <h3 className="font-serif text-2xl font-normal text-charcoal mb-1 leading-snug">
            {activeVenue.name}
          </h3>

          {/* Category · Neighborhood */}
          <p className="font-sans text-sm text-muted mb-4">
            {formatCategory(activeVenue.category)} &middot;{" "}
            {neighborhoodLabel(activeVenue.neighborhood)}
          </p>

          {/* Award badge */}
          {activeVenue.awards && (
            <div className="mb-4">
              <span className="inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-burgundy/10 text-burgundy">
                {activeVenue.awards}
              </span>
            </div>
          )}

          {/* Curation note */}
          <p className="font-sans text-[15px] text-[#444444] leading-relaxed mb-5">
            {activeNote}
          </p>

          {/* Meta row */}
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

              {onSwap && (
                <button
                  onClick={onSwap}
                  className="text-burgundy hover:text-burgundy-light transition-colors"
                >
                  Swap
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted shrink-0 pt-0.5">
              <StopStatusBadge status={statusKind} />
              {bookAhead && <span>Book ahead</span>}
              {cashOnly && <span>Cash only</span>}
            </div>
          </div>

          {swapError && (
            <p className="font-sans text-xs text-burgundy mt-2">{swapError}</p>
          )}
        </>
      )}
    </motion.div>
  );
}

function SwapSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-6 w-3/5 rounded bg-border" />
      <div className="h-4 w-2/5 rounded bg-border" />
      <div className="h-16 w-full rounded bg-border" />
      <div className="h-4 w-1/4 rounded bg-border" />
    </div>
  );
}
