"use client";

import { motion } from "motion/react";
import { ItineraryStop } from "@/types";
import { ROLE_LABELS } from "@/config/roles";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { detectBookingPlatform } from "@/lib/booking";
import { getVenueHeroImageUrl } from "@/lib/venues/images";
import { buildResyBookingUrl } from "@/lib/availability/booking-url";

const BOOK_AHEAD_THRESHOLD = 3;

interface StopCardProps {
  stop: ItineraryStop;
  index: number;
  date?: string;
  partySize?: number;
  onSwap?: () => void;
  onVenueTap?: () => void;
  isSwapping?: boolean;
  swapError?: string | null;
  hasSelectedSlot?: boolean;
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

function reservationStatus(
  difficulty: number | null,
  hasBookingPlatform: boolean
): string {
  if ((difficulty ?? 0) >= BOOK_AHEAD_THRESHOLD) return "Reservations required";
  if (hasBookingPlatform) return "Reservations recommended";
  return "Walk-in welcome";
}

function formatReviewCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function StopCard({
  stop,
  index,
  date,
  partySize = 2,
  onSwap,
  onVenueTap,
  isSwapping = false,
  swapError,
  hasSelectedSlot = false,
}: StopCardProps) {
  const v = stop.venue;
  const activeNote = stop.curation_note;

  const bookingPlatform = detectBookingPlatform(v.reservation_url);
  const resStatus = reservationStatus(
    v.reservation_difficulty,
    !!bookingPlatform
  );

  // Hide inline reserve link when user has selected a time (CTA moves to availability section)
  const showInlineReserve =
    !hasSelectedSlot && !!bookingPlatform && !!v.reservation_url;

  // Build a date-aware Resy URL when possible, otherwise fall back to raw reservation_url
  const reserveHref =
    bookingPlatform?.id === "resy" && v.resy_slug && date
      ? buildResyBookingUrl(v.resy_slug, date, partySize)
      : v.reservation_url;

  return (
    <motion.div
      className="py-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
    >
      {/* Role label */}
      <div className="font-sans text-[11px] tracking-widest uppercase text-muted mb-1.5">
        {ROLE_LABELS[stop.role]}
      </div>

      {isSwapping ? (
        <SwapSkeleton />
      ) : (
        <>
          {/* Hero image — unchanged */}
          {(() => {
            const heroUrl = getVenueHeroImageUrl(v.image_keys ?? []);
            return heroUrl ? (
              <div className="rounded-lg overflow-hidden mb-3 -mx-1">
                <img
                  src={heroUrl}
                  alt={v.name}
                  className="w-full h-40 object-cover"
                  loading="lazy"
                />
              </div>
            ) : null;
          })()}

          {/* Identity line: name + rating */}
          <div className="flex items-baseline justify-between gap-3 mb-0.5">
            <h3 className="font-serif text-2xl font-normal text-charcoal leading-snug min-w-0">
              {onVenueTap ? (
                <button
                  type="button"
                  onClick={onVenueTap}
                  className="text-left hover:text-burgundy transition-colors"
                >
                  {v.name}
                </button>
              ) : (
                v.name
              )}
            </h3>
            {v.google_rating != null && (
              <span className="font-sans text-xs text-muted whitespace-nowrap shrink-0">
                {v.google_rating} ★
                {v.google_review_count != null && (
                  <> {formatReviewCount(v.google_review_count)}</>
                )}
              </span>
            )}
          </div>

          {/* Meta line: category · neighborhood · price · reservation status */}
          <p className="font-sans text-sm text-muted mb-3">
            {formatCategory(v.category ?? "")} &middot;{" "}
            {neighborhoodLabel(v.neighborhood)} &middot;{" "}
            {stop.spend_estimate} &middot; {resStatus}
          </p>

          {/* Composer Favorite */}
          {v.awards && (
            <div className="font-sans text-[11px] tracking-widest uppercase text-muted mb-2">
              {v.awards}
            </div>
          )}

          {/* Description */}
          <p className="font-sans text-[15px] text-[#444444] leading-relaxed mb-4">
            {activeNote}
          </p>

          {/* Actions row */}
          <div className="flex items-center justify-end gap-4 font-sans text-sm">
            {showInlineReserve && reserveHref && (
              <a
                href={reserveHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-burgundy hover:text-burgundy-light transition-colors"
              >
                {bookingPlatform!.label} →
              </a>
            )}
            {onSwap && (
              <button
                onClick={onSwap}
                className="text-muted hover:text-charcoal transition-colors"
              >
                Swap
              </button>
            )}
          </div>

          {swapError && (
            <p className="font-sans text-xs text-muted mt-2">{swapError}</p>
          )}
        </>
      )}
    </motion.div>
  );
}
