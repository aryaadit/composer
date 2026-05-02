"use client";

// Saved venues grid on the profile page. Intersects server-fetched
// venues with the client-side savedIds set so optimistic unsave from
// the detail modal removes cards immediately without a page reload.

import { useState } from "react";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { formatCategory } from "@/lib/format/category";
import { getVenueHeroImageUrl } from "@/lib/venues/images";
import { useSavedVenues } from "@/components/providers/SavedVenuesProvider";
import { VenueDetailModal } from "@/components/venue/VenueDetailModal";
import type { Venue } from "@/types";

interface Props {
  venues: Venue[];
}

function primaryVibeTag(venue: Venue): string {
  if (venue.vibe_tags?.length > 0) {
    return formatCategory(venue.vibe_tags[0]);
  }
  return formatCategory(venue.category ?? "");
}

export function YourPlacesGrid({ venues }: Props) {
  const { savedIds, toggle } = useSavedVenues();
  const [detailVenue, setDetailVenue] = useState<Venue | null>(null);

  // Client-side filter: only show venues still in the saved set.
  const visible = venues.filter((v) => savedIds.has(v.id));

  if (visible.length === 0) {
    return (
      <p className="font-sans text-sm text-muted">
        No saved places yet. Tap the heart on any stop to save it for next time.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {visible.map((v) => {
          const heroUrl = getVenueHeroImageUrl(v.image_keys ?? []);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setDetailVenue(v)}
              aria-label={`Open ${v.name}`}
              className={`text-left rounded-xl border border-border overflow-hidden hover:border-burgundy/30 transition-colors ${
                !v.active ? "opacity-55" : ""
              }`}
            >
              <div className="aspect-[16/9] bg-cream-dark">
                {heroUrl ? (
                  <img
                    src={heroUrl}
                    alt={v.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-border/30" />
                )}
              </div>
              <div className="p-3">
                <p className="font-serif text-base font-medium text-charcoal leading-snug truncate">
                  {v.name}
                </p>
                <p className="font-sans text-xs text-muted mt-1 truncate">
                  {neighborhoodLabel(v.neighborhood)} &middot; {primaryVibeTag(v)}
                </p>
                {!v.active && (
                  <p className="font-sans text-[11px] text-muted italic mt-1">
                    (no longer active)
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <VenueDetailModal
        venue={detailVenue}
        onClose={() => setDetailVenue(null)}
      />
    </>
  );
}
