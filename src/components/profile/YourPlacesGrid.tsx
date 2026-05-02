"use client";

// 2-column grid of saved venues on the profile page. Tapping a card
// opens VenueDetailSheet with curation note, address, reservation
// link, and unsave button.

import { useState } from "react";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { VenueDetailSheet } from "./VenueDetailSheet";
import type { Venue } from "@/types";

interface Props {
  venues: Venue[];
  onUnsave: (venueId: string) => void;
}

export function YourPlacesGrid({ venues, onUnsave }: Props) {
  const [detailVenue, setDetailVenue] = useState<Venue | null>(null);

  if (venues.length === 0) {
    return (
      <div className="py-8 border-t border-border">
        <p className="font-sans text-sm text-muted">
          No saved places yet.
        </p>
        <p className="font-sans text-xs text-muted mt-1">
          Tap the heart on any stop to save it for next time.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 border-t border-border pt-4">
        {venues.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setDetailVenue(v)}
            className={`text-left rounded-xl border border-border p-3 hover:border-burgundy/30 transition-colors ${
              !v.active ? "opacity-50" : ""
            }`}
          >
            <p className="font-serif text-base font-medium text-charcoal leading-snug truncate">
              {v.name}
            </p>
            <p className="font-sans text-[13px] text-muted mt-1 truncate">
              {neighborhoodLabel(v.neighborhood)}
              {v.category ? ` · ${formatCategory(v.category)}` : ""}
            </p>
            {!v.active && (
              <p className="font-sans text-[11px] text-muted mt-1">
                (no longer active)
              </p>
            )}
          </button>
        ))}
      </div>

      {detailVenue && (
        <VenueDetailSheet
          venue={detailVenue}
          onClose={() => setDetailVenue(null)}
          onUnsave={() => {
            onUnsave(detailVenue.id);
            setDetailVenue(null);
          }}
        />
      )}
    </>
  );
}
