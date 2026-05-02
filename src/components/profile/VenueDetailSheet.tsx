"use client";

// Bottom sheet showing venue details when tapped from YourPlacesGrid.
// Shows curation note, address, reservation link, and unsave button.

import { motion, AnimatePresence } from "motion/react";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { detectBookingPlatform } from "@/lib/booking";
import type { Venue } from "@/types";

interface Props {
  venue: Venue;
  onClose: () => void;
  onUnsave: () => void;
}

export function VenueDetailSheet({ venue, onClose, onUnsave }: Props) {
  const platform = detectBookingPlatform(venue.reservation_url);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 bg-charcoal/40 z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        key="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={venue.name}
        className="fixed bottom-0 left-0 right-0 z-50 bg-cream rounded-t-2xl shadow-xl max-h-[80vh] overflow-y-auto"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 280 }}
      >
        <div className="flex justify-center pt-3 pb-2" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="px-6 pb-8 max-w-lg mx-auto">
          <h2 className="font-serif text-2xl text-charcoal mb-1">
            {venue.name}
          </h2>
          <p className="font-sans text-sm text-muted mb-4">
            {formatCategory(venue.category ?? "")} &middot;{" "}
            {neighborhoodLabel(venue.neighborhood)}
          </p>

          {venue.curation_note && (
            <p className="font-sans text-[15px] text-[#444] leading-relaxed mb-4">
              {venue.curation_note}
            </p>
          )}

          {venue.address && (
            <p className="font-sans text-xs text-muted mb-4">
              {venue.address}
            </p>
          )}

          {platform && venue.reservation_url && (
            <a
              href={venue.reservation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mb-4 font-sans text-sm text-burgundy hover:text-burgundy-light transition-colors"
            >
              {platform.label} →
            </a>
          )}

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onUnsave}
              className="flex-1 py-3 rounded-full border border-border font-sans text-sm text-charcoal hover:border-charcoal/40 transition-colors"
            >
              Unsave
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-full bg-burgundy text-cream font-sans text-sm font-medium hover:bg-burgundy-light transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
