"use client";

import { motion } from "motion/react";
import { ItineraryStop } from "@/types";
import { ROLE_LABELS } from "@/config/roles";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { detectBookingPlatform, isValidReservationUrl } from "@/lib/booking";
import { getVenueHeroImageUrl } from "@/lib/venues/images";
import { buildResyBookingUrl } from "@/lib/availability/booking-url";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import { ComposeFailureBlock } from "@/components/itinerary/ComposeFailureBlock";
import { EVENTS } from "@/lib/analytics";
import type { ComposeFailure } from "@/lib/itinerary/compose-failure";

const BOOK_AHEAD_THRESHOLD = 3;

interface StopCardProps {
  stop: ItineraryStop;
  index: number;
  date?: string;
  partySize?: number;
  onSwap?: () => void;
  onVenueTap?: () => void;
  isSwapping?: boolean;
  /** Structured failure from the last swap attempt at THIS stop. When
   *  present, render the prominent ComposeFailureBlock and let the
   *  parent suppress the Swap affordance by omitting `onSwap`. Single
   *  copy source — the block draws verbatim from the compose-failure
   *  registry. */
  swapFailure?: ComposeFailure | null;
  /** When true, hide the reserve link (and Swap, by virtue of `onSwap`
   * not being passed). Used on past-date itineraries where the data is
   * stale and a reservation flow would be misleading. */
  isPast?: boolean;
  /** Briefly applied (~1.5s) when the user taps the matching pin on
   * ItineraryMap. Renders a burgundy ring around the card to surface
   * where the user just jumped. Cleared by the parent via timeout. */
  highlighted?: boolean;
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
  swapFailure,
  isPast = false,
  highlighted = false,
}: StopCardProps) {
  const { trackEngagement } = useEngagement();
  const v = stop.venue;
  const activeNote = stop.curation_note;

  const bookingPlatform = detectBookingPlatform(v.reservation_url);
  const resStatus = reservationStatus(
    v.reservation_difficulty,
    !!bookingPlatform
  );

  // When live availability shows a slot grid, Reserve + Swap render
  // inside StopAvailabilitySection (next to "Available times" and "Show
  // more times" respectively). Otherwise they live in this card's footer.
  const hasSlots = stop.availability?.status === "has_slots";

  // StopAvailability renders its own contextual CTA for has_slots,
  // unconfirmed, and no_slots_in_block (e.g., "Check availability →",
  // "See other times →"). When any of those will fire, suppress the
  // StopCard footer link to avoid a redundant CTA. The footer link
  // still renders when availability is undefined (no enrichment data —
  // old saved itineraries) or walk_in (StopAvailability returns null).
  const hasAvailabilityCta =
    stop.availability?.status === "has_slots" ||
    stop.availability?.status === "unconfirmed" ||
    stop.availability?.status === "no_slots_in_block";

  // Past itineraries hide reservation CTAs entirely — the data behind
  // them (slot availability, party-size links) is no longer accurate.
  const showInlineReserve =
    !isPast &&
    !hasAvailabilityCta &&
    !!bookingPlatform &&
    isValidReservationUrl(v.reservation_url);

  // Show muted "Walk-in only" text where the CTA would have been when
  // the sheet uses reservation_url as a free-text status ("Walk-in Only").
  const showWalkInLabel =
    !isPast && !hasSlots && v.reservation_url === "Walk-in Only";

  const showInlineSwap = !!onSwap && !hasSlots;
  const showActionsRow = showInlineReserve || showWalkInLabel || showInlineSwap;

  // Build a date-aware reservation URL.
  // Prefer canonical slug URL; for Resy venues without a slug, append
  // date/seats params to the raw reservation_url so Resy opens the right day.
  const reserveHref = (() => {
    if (!isValidReservationUrl(v.reservation_url)) return null;
    if (bookingPlatform?.id === "resy" && date) {
      if (v.resy_slug) {
        return buildResyBookingUrl(v.resy_slug, date, partySize);
      }
      // Append date + seats to raw Resy URL
      const url = new URL(v.reservation_url);
      url.searchParams.set("date", date);
      url.searchParams.set("seats", String(partySize));
      return url.toString();
    }
    return v.reservation_url;
  })();

  return (
    <motion.div
      data-stop-index={index}
      className={`py-5 transition-all duration-300 ${
        highlighted ? "ring-2 ring-burgundy/40 rounded-lg" : ""
      }`}
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

          {/* Actions row — booking on the left, curation (Swap) on the
              right. Hidden entirely when the slot grid is showing; in
              that case Reserve + Swap render inside StopAvailability. */}
          {showActionsRow && (
            <div className="flex items-center justify-between gap-4 font-sans">
              <div className="text-sm">
                {showInlineReserve && reserveHref && (
                  <a
                    href={reserveHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEngagement(EVENTS.RESERVATION_CLICKED, {
                        venue_id: v.id,
                        venue_name: v.name,
                        platform: bookingPlatform!.id,
                        stop_index: index,
                        stop_role: stop.role,
                        from_surface: "stop_card",
                      })
                    }
                    className="text-burgundy hover:text-burgundy-light transition-colors"
                  >
                    {bookingPlatform!.label} →
                  </a>
                )}
                {!showInlineReserve && showWalkInLabel && (
                  <span className="text-muted">Walk-in only</span>
                )}
              </div>
              {showInlineSwap && (
                <button
                  onClick={onSwap}
                  className="text-xs text-muted hover:text-charcoal transition-colors"
                >
                  Swap
                </button>
              )}
            </div>
          )}

          {swapFailure && (
            // Prominent inline failure — burgundy-accented block routed
            // through the compose-failure registry. Parent has already
            // suppressed the Swap button by omitting onSwap.
            <ComposeFailureBlock failure={swapFailure} className="mt-3" />
          )}
        </>
      )}
    </motion.div>
  );
}
