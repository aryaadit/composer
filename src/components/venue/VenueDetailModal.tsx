"use client";

// Venue detail modal — bottom sheet on mobile, centered modal on desktop.
// Photos from Supabase Storage via image_keys. No live API calls on open.

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { StopRole, Venue } from "@/types";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory, formatVibeTag } from "@/lib/format/category";
import { formatVenueHours } from "@/lib/format/hours";
import { getVenueImageUrls } from "@/lib/venues/images";
import { detectBookingPlatform, isValidReservationUrl } from "@/lib/booking";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import { Button } from "@/components/ui/Button";
import { EVENTS } from "@/lib/analytics";

interface VenueDetailModalProps {
  venue: Venue | null;
  /** Stop role passed through from ItineraryView so reservation /
   * maps events can attribute the click to its position in the night. */
  stopRole?: StopRole | null;
  /** Optional stop index, threaded from ItineraryView so reservation
   * events can attribute by stop position. Modal is open-able from a
   * non-stop surface in some flows (none today, but reserved). */
  stopIndex?: number;
  onClose: () => void;
}

export function VenueDetailModal({
  venue,
  stopRole,
  stopIndex,
  onClose,
}: VenueDetailModalProps) {
  useEffect(() => {
    if (!venue) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [venue, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!venue) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [venue]);

  return (
    <AnimatePresence>
      {venue && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-charcoal/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={venue.name}
            className="fixed inset-x-0 bottom-0 z-50 bg-cream rounded-t-2xl shadow-xl max-h-[90dvh] overflow-y-auto overscroll-contain md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:rounded-2xl md:max-h-[85dvh]"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            <VenueDetailContent
              venue={venue}
              stopRole={stopRole ?? null}
              stopIndex={stopIndex}
              onClose={onClose}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function VenueDetailContent({
  venue,
  stopRole,
  stopIndex,
  onClose,
}: {
  venue: Venue;
  stopRole: StopRole | null;
  stopIndex: number | undefined;
  onClose: () => void;
}) {
  const { trackEngagement } = useEngagement();
  // V2 venues have Google data as direct fields, not JSONB
  const photos = getVenueImageUrls(venue.image_keys ?? []);
  const hoursDisplay = formatVenueHours(venue.hours);

  return (
    <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* Grabber + close */}
      <div className="sticky top-0 z-10 bg-cream rounded-t-2xl pt-3 pb-2 px-6 flex items-center justify-between">
        <div className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 w-11 h-11 inline-flex items-center justify-center font-sans text-sm text-muted hover:text-charcoal transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Photo carousel */}
      {photos.length > 0 && <PhotoCarousel photos={photos} />}

      <div className="px-6 pt-4">
        {/* Name + category */}
        <h2 className="font-serif text-2xl font-normal text-charcoal leading-snug">
          {venue.name}
        </h2>
        <p className="font-sans text-sm text-muted mt-1">
          {formatCategory(venue.category ?? "")} &middot;{" "}
          {neighborhoodLabel(venue.neighborhood)}
        </p>

        {/* Rating + phone */}
        <div className="flex items-center gap-4 mt-3 font-sans text-sm">
          {venue.google_rating != null && (
            <span className="text-charcoal font-medium">
              ★ {venue.google_rating}{" "}
              <span className="text-muted font-normal">
                ({venue.google_review_count ?? 0})
              </span>
            </span>
          )}
          {venue.google_phone && (
            <a
              href={`tel:${venue.google_phone}`}
              className="text-burgundy hover:text-burgundy-light transition-colors"
            >
              {venue.google_phone}
            </a>
          )}
        </div>

        {/* Awards */}
        {venue.awards && (
          <div className="mt-4">
            <span className="inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-burgundy/10 text-burgundy">
              {venue.awards}
            </span>
          </div>
        )}

        {/* Audit items 21 + 28 + 6: roman (not italic), warm-gray
            token + text-base on the body copy, and the attribution
            line drops the em-dash prefix per BRAND_VOICE. The
            burgundy border-l and editorial framing remain. */}
        <blockquote className="mt-4 border-l-2 border-burgundy/30 pl-4 font-sans text-base text-warm-gray leading-relaxed">
          {venue.curation_note}
          <span className="block text-xs text-muted mt-1">Composer</span>
        </blockquote>

        {/* Signature order */}
        {venue.signature_order && (
          <p className="mt-3 font-sans text-sm text-charcoal">
            <span className="font-medium">Order this:</span>{" "}
            {venue.signature_order}
          </p>
        )}

        {/* Vibe tags. Audit item 21: casing map via formatVibeTag —
            acronyms uppercase (IYKYK), others sentence case. */}
        {venue.vibe_tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {venue.vibe_tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 text-xs font-sans rounded-full bg-burgundy/10 text-burgundy"
              >
                {formatVibeTag(tag)}
              </span>
            ))}
          </div>
        )}

        {/* Hours */}
        {hoursDisplay && (
          <div className="mt-4">
            {hoursDisplay.kind === "raw" ? (
              <p className="font-sans text-sm text-muted">{hoursDisplay.text}</p>
            ) : (
              <div className="space-y-0.5">
                {hoursDisplay.rows.map((row) => (
                  <div
                    key={row.days}
                    className="flex justify-between gap-6 font-sans text-sm"
                  >
                    <span className="text-charcoal">{row.days}</span>
                    <span className="text-muted text-right">{row.hours}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {venue.happy_hour && (
          <p className="font-sans text-sm text-muted mt-2">
            <span className="font-medium text-charcoal">Happy hour:</span>{" "}
            {venue.happy_hour}
          </p>
        )}

        {/* Address */}
        {venue.address && (
          <div className="mt-4">
            <p className="font-sans text-sm text-muted">
              {venue.address}
            </p>
            <a
              href={
                // Priority: curator override → Google business listing →
                // coord fallback. The place_id form opens the actual
                // venue page (reviews/hours/photos) instead of a bare pin.
                venue.maps_url ??
                (venue.google_place_id
                  ? `https://www.google.com/maps/place/?q=place_id:${venue.google_place_id}`
                  : `https://maps.google.com/?q=${venue.latitude},${venue.longitude}`)
              }
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackEngagement(EVENTS.DIRECTIONS_OPENED, {
                  surface: "single_venue_modal",
                  venue_id: venue.id,
                  venue_name: venue.name,
                  stop_index: stopIndex,
                })
              }
              className="font-sans text-sm text-burgundy hover:text-burgundy-light transition-colors mt-1 inline-block"
            >
              Open in Maps →
            </a>
          </div>
        )}

        {/* Amenity badges */}
        <AmenityBadges venue={venue} />

        {/* Action buttons */}
        <div className="flex gap-3 mt-6">
          {isValidReservationUrl(venue.reservation_url) && (
            // Audit item 30: routed through Button primitive. The
            // !px-4 !py-3 overrides preserve the existing
            // "px-4 py-3 text-sm" recipe at pixel parity — Button's
            // size="sm" default is `px-5 py-2.5` which would visually
            // shift the modal's bottom action row. Documented unavoidable
            // class-name override; no perceived delta.
            <Button
              variant="primary"
              size="sm"
              href={venue.reservation_url}
              target="_blank"
              onClick={() =>
                trackEngagement(EVENTS.RESERVATION_CLICKED, {
                  venue_id: venue.id,
                  venue_name: venue.name,
                  platform:
                    detectBookingPlatform(venue.reservation_url)?.id ?? "other",
                  stop_index: stopIndex,
                  stop_role: stopRole ?? "main",
                  from_surface: "venue_detail_modal",
                })
              }
              className="flex-1 !px-4 !py-3"
            >
              Reserve
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Photo Carousel ──────────────────────────────────────────

function PhotoCarousel({ photos }: { photos: string[] }) {
  const [current, setCurrent] = useState(0);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const index = Math.round(el.scrollLeft / el.clientWidth);
      if (index !== current && index >= 0 && index < photos.length) {
        setCurrent(index);
      }
    },
    [current, photos.length]
  );

  return (
    <div className="relative">
      <div
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
        onScroll={handleScroll}
      >
        {photos.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`Photo ${i + 1}`}
            className="w-full h-56 object-cover snap-center shrink-0 md:h-64"
            loading={i === 0 ? "eager" : "lazy"}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {photos.map((_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === current ? "bg-cream" : "bg-cream/50"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Amenity Badges ──────────────────────────────────────────

function AmenityBadges({ venue }: { venue: Venue }) {
  const badges: { label: string; icon: string }[] = [];

  if (venue.dog_friendly) badges.push({ label: "Dog friendly", icon: "🐕" });
  if (venue.wheelchair_accessible)
    badges.push({ label: "Accessible", icon: "♿" });
  if (venue.vibe_tags?.includes("cash_only"))
    badges.push({ label: "Cash only", icon: "💵" });
  if (venue.outdoor_seating === "yes")
    badges.push({ label: "Outdoor seating", icon: "☀️" });

  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {badges.map(({ label, icon }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-sans rounded-full border border-border text-muted"
        >
          <span aria-hidden>{icon}</span>
          {label}
        </span>
      ))}
    </div>
  );
}
