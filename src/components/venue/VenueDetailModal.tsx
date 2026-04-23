"use client";

// Venue detail modal — bottom sheet on mobile, centered modal on desktop.
// Reads from the cached google_place_data JSONB and google_place_photos
// storage paths. No live API calls on open.

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Venue } from "@/types";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";


interface VenueDetailModalProps {
  venue: Venue | null;
  onClose: () => void;
}

function photoUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/venue-photos/${path}`;
}

export function VenueDetailModal({ venue, onClose }: VenueDetailModalProps) {
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
            className="fixed inset-x-0 bottom-0 z-50 bg-cream rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:rounded-2xl md:max-h-[85vh]"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            <VenueDetailContent venue={venue} onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function VenueDetailContent({
  venue,
  onClose,
}: {
  venue: Venue;
  onClose: () => void;
}) {
  // V2 venues have Google data as direct fields, not JSONB
  const photos: string[] = [];

  return (
    <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {/* Grabber + close */}
      <div className="sticky top-0 z-10 bg-cream rounded-t-2xl pt-3 pb-2 px-6 flex items-center justify-between">
        <div className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-3 font-sans text-sm text-muted hover:text-charcoal transition-colors p-3 -m-2"
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

        <blockquote className="mt-4 border-l-2 border-burgundy/30 pl-4 font-sans text-[15px] text-[#444444] leading-relaxed italic">
          {venue.curation_note}
          <span className="block text-xs text-muted mt-1 not-italic">
            — Composer
          </span>
        </blockquote>

        {/* Signature order */}
        {venue.signature_order && (
          <p className="mt-3 font-sans text-sm text-charcoal">
            <span className="font-medium">Order this:</span>{" "}
            {venue.signature_order}
          </p>
        )}

        {/* Vibe tags */}
        {venue.vibe_tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {venue.vibe_tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 text-xs font-sans rounded-full bg-burgundy/10 text-burgundy"
              >
                {formatCategory(tag)}
              </span>
            ))}
          </div>
        )}

        {/* Hours */}
        {venue.hours && (
          <div className="mt-4">
            <p className="font-sans text-sm text-muted">{venue.hours}</p>
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
                venue.maps_url ??
                `https://maps.google.com/?q=${venue.latitude},${venue.longitude}`
              }
              target="_blank"
              rel="noopener noreferrer"
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
          {venue.reservation_url && (
            <a
              href={venue.reservation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center px-4 py-3 rounded-full bg-burgundy text-cream font-sans text-sm font-medium hover:bg-burgundy-light transition-colors"
            >
              Reserve
            </a>
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
        {photos.map((path, i) => (
          <img
            key={path}
            src={photoUrl(path)}
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
