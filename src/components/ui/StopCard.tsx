"use client";

import { motion } from "motion/react";
import { ItineraryStop } from "@/types";
import { ROLE_LABELS } from "@/config/roles";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { StopStatusBadge } from "@/components/ui/StopStatusBadge";
import { detectBookingPlatform } from "@/lib/booking";
import { getVenueHeroImageUrl } from "@/lib/venues/images";

const BOOK_AHEAD_THRESHOLD = 3;

interface StopCardProps {
  stop: ItineraryStop;
  index: number;
  onSwap?: () => void;
  onRemove?: () => void;
  onVenueTap?: () => void;
  isSwapping?: boolean;
  swapError?: string | null;
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

export function StopCard({
  stop,
  index,
  onSwap,
  onRemove,
  onVenueTap,
  isSwapping = false,
  swapError,
}: StopCardProps) {
  const activeVenue = stop.venue;
  const activeNote = stop.curation_note;

  const bookAhead =
    (activeVenue.reservation_difficulty ?? 0) >= BOOK_AHEAD_THRESHOLD;
  const cashOnly = activeVenue.vibe_tags?.includes("cash_only") ?? false;
  const bookingPlatform = detectBookingPlatform(activeVenue.reservation_url);
  const statusKind = stop.is_fixed ? "fixed" : "flexible";

  return (
    <motion.div
      className="py-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
    >
      <div className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
        {ROLE_LABELS[stop.role]}
      </div>

      {isSwapping ? (
        <SwapSkeleton />
      ) : (
        <>
          {(() => {
            const heroUrl = getVenueHeroImageUrl(activeVenue.image_keys ?? []);
            return heroUrl ? (
              <div className="rounded-lg overflow-hidden mb-4 -mx-1">
                <img
                  src={heroUrl}
                  alt={activeVenue.name}
                  className="w-full h-40 object-cover"
                  loading="lazy"
                />
              </div>
            ) : null;
          })()}

          <h3 className="font-serif text-2xl font-normal text-charcoal mb-1 leading-snug">
            {onVenueTap ? (
              <button
                type="button"
                onClick={onVenueTap}
                className="text-left hover:text-burgundy transition-colors"
              >
                {activeVenue.name}
              </button>
            ) : (
              activeVenue.name
            )}
          </h3>

          <p className="font-sans text-sm text-muted mb-1">
            {formatCategory(activeVenue.category ?? "")} &middot;{" "}
            {neighborhoodLabel(activeVenue.neighborhood)}
          </p>

          {activeVenue.google_rating != null && (
            <p className="font-sans text-xs text-muted mb-4">
              {activeVenue.google_rating} ★
              {activeVenue.google_review_count != null && (
                <span>
                  {" "}· {activeVenue.google_review_count >= 1000
                    ? `${(activeVenue.google_review_count / 1000).toFixed(1)}k`
                    : activeVenue.google_review_count} reviews
                </span>
              )}
            </p>
          )}

          {!activeVenue.google_rating && <div className="mb-3" />}

          {activeVenue.awards && (
            <div className="mb-4">
              <span className="inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-burgundy/10 text-burgundy">
                {activeVenue.awards}
              </span>
            </div>
          )}

          <p className="font-sans text-[15px] text-[#444444] leading-relaxed mb-5">
            {activeNote}
          </p>

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

              {onSwap && (
                <button
                  onClick={onSwap}
                  className="text-burgundy hover:text-burgundy-light transition-colors"
                >
                  Swap
                </button>
              )}
              {onRemove && (
                <button
                  onClick={onRemove}
                  className="text-muted hover:text-charcoal transition-colors"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted shrink-0 pt-0.5">
              {statusKind === "fixed" && <StopStatusBadge status="fixed" />}
              {bookAhead && <span>Book ahead</span>}
              {cashOnly && <span>Cash only</span>}
            </div>
          </div>

          {swapError && (
            <p className="font-sans text-xs text-muted mt-3">{swapError}</p>
          )}

        </>
      )}
    </motion.div>
  );
}
