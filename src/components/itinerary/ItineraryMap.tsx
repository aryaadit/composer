"use client";

// Inline overview map for an itinerary. Lives at the top of
// ItineraryView, above any banners and the stop list. Shows one numbered
// pin per stop in stop order, straight-line polyline between them, fit
// to bounds with sensible padding. Tap a pin → scroll to that stop card
// and pulse-highlight it; tap the map body → expand to a fullscreen
// overlay; close with Esc / backdrop / close button.
//
// mapbox-gl is dynamically imported (ssr: false) so its ~200KB bundle +
// CSS land in their own chunk, not the initial page load. Component is
// safe to render unconditionally — returns null when there are zero
// stops with valid coordinates.

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { LineString } from "geojson";
import { EVENTS } from "@/lib/analytics";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import type { ItineraryStop, WalkSegment } from "@/types";
import type { ItinerarySurface } from "./ItineraryView";
import type { MapPin, ItineraryRouteSegment } from "./ItineraryMapInner";

// Dynamic import isolates mapbox-gl into its own chunk + skips SSR. The
// chunk loads only when ItineraryView renders (which is itself a client
// route). Loading placeholder is the empty wrapper — keeps layout stable.
const ItineraryMapInner = dynamic(
  () => import("./ItineraryMapInner").then((m) => m.ItineraryMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-border/40 animate-pulse" aria-hidden />
    ),
  }
);

interface ItineraryMapProps {
  stops: ItineraryStop[];
  /** Phase 10 — one walk per gap between consecutive stops (length =
   * stops.length - 1). Each carries a `route_geometry` from the Mapbox
   * Directions cache. When undefined or shorter than expected (legacy
   * saved itineraries), ItineraryMapInner falls back to straight lines
   * for the missing segments. */
  walks?: WalkSegment[];
  surface: ItinerarySurface;
  /** Setter for the parent's highlightedStopIndex state. ItineraryMap
   * sets it on pin tap; ItineraryView watches the value, passes it to
   * StopCard for the ring pulse, and clears it after the pulse window. */
  onHighlightStop: (originalIndex: number) => void;
}

export function ItineraryMap({
  stops,
  walks,
  surface,
  onHighlightStop,
}: ItineraryMapProps) {
  const { trackEngagement } = useEngagement();
  // Build pin list — filter stops missing coordinates so route segments
  // skip them entirely (interpolate around) and pins aren't dropped at
  // (0,0). The `label` preserves the user-facing stop number even when
  // intervening stops were filtered out.
  const pins: MapPin[] = stops
    .map((stop, originalIndex) => ({ stop, originalIndex }))
    .filter(
      ({ stop }) =>
        typeof stop.venue.latitude === "number" &&
        typeof stop.venue.longitude === "number" &&
        Number.isFinite(stop.venue.latitude) &&
        Number.isFinite(stop.venue.longitude)
    )
    .map(({ stop, originalIndex }) => ({
      label: originalIndex + 1,
      originalIndex,
      lat: stop.venue.latitude,
      lng: stop.venue.longitude,
      venueId: stop.venue.id,
      venueName: stop.venue.name,
    }));

  // Phase 10: align walks (stops.length - 1) with pins (post-filter).
  // The kept-pin order mirrors stop order, so the walk that lives
  // between two adjacent kept stops is the walk at the lower stop's
  // original index. Filtered-out stops drop their adjacent walks
  // entirely; the polyline falls back to a straight line for that gap.
  const routeSegments: ItineraryRouteSegment[] | undefined = useMemo(() => {
    if (!walks || pins.length < 2) return undefined;
    const out: ItineraryRouteSegment[] = [];
    for (let i = 0; i < pins.length - 1; i++) {
      const fromOriginal = pins[i].originalIndex;
      const toOriginal = pins[i + 1].originalIndex;
      // Walks are 1:1 with consecutive stops in the original list. Only
      // use the walk when both pins are adjacent stops (no filtered
      // stops in between); otherwise leave the geometry undefined so
      // the inner component draws a straight line.
      if (toOriginal === fromOriginal + 1) {
        const w = walks[fromOriginal];
        out.push({
          geometry: (w?.route_geometry as LineString | null | undefined) ?? null,
        });
      } else {
        out.push({ geometry: null });
      }
    }
    return out;
  }, [walks, pins]);

  const [expanded, setExpanded] = useState(false);

  // Close fullscreen on Esc — mirrors VenueDetailModal's pattern.
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expanded]);

  // Lock body scroll when fullscreen (avoid the page scrolling behind
  // the overlay on touch devices).
  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const handlePinClick = useCallback(
    (pin: MapPin) => {
      trackEngagement(EVENTS.MAP_PIN_TAPPED, {
        stop_index: pin.originalIndex,
        venue_id: pin.venueId,
        venue_name: pin.venueName,
        from_surface: surface,
      });
      onHighlightStop(pin.originalIndex);
      // Scroll the corresponding StopCard into view. data-stop-index
      // attribute is set in StopCard's outer motion.div. Block:"center"
      // so the pulse is visible mid-viewport on mobile.
      const target = document.querySelector(
        `[data-stop-index="${pin.originalIndex}"]`
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Close fullscreen overlay (if open) after pin-tap — the user
      // wanted to jump to the stop, not stay in the map.
      if (expanded) setExpanded(false);
    },
    [surface, onHighlightStop, expanded, trackEngagement]
  );

  const handleMapClick = useCallback(() => {
    // Only the inline map should expand. When already fullscreen, taps
    // on the map body do nothing (backdrop has its own handler).
    if (expanded) return;
    trackEngagement(EVENTS.MAP_EXPANDED, { from_surface: surface });
    setExpanded(true);
  }, [expanded, surface, trackEngagement]);

  if (pins.length === 0) return null;

  return (
    <>
      {/* Inline map. Always mounted so layout doesn't reflow on
          expand/collapse and the WebGL context isn't repeatedly torn
          down. */}
      <div className="w-full max-w-lg mx-auto mb-6">
        <div className="relative h-[220px] md:h-[280px] rounded-lg overflow-hidden border border-border">
          <ItineraryMapInner
            pins={pins}
            routeSegments={routeSegments}
            onPinClick={handlePinClick}
            onMapClick={handleMapClick}
          />
        </div>
      </div>

      {/* Fullscreen overlay — second Map instance. Briefly two WebGL
          contexts when expanded; acceptable for a transient state. */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/80"
          role="dialog"
          aria-modal="true"
          aria-label="Itinerary map (fullscreen)"
          onClick={(e) => {
            // Backdrop click closes. Inner Map element will bubble
            // here only when the user taps outside any pin AND outside
            // the close button. handleMapClick is gated on !expanded
            // so it won't fire while fullscreen.
            if (e.target === e.currentTarget) setExpanded(false);
          }}
        >
          <div className="absolute inset-2 md:inset-8 rounded-lg overflow-hidden bg-cream">
            <ItineraryMapInner
              pins={pins}
              routeSegments={routeSegments}
              onPinClick={handlePinClick}
              // No onMapClick when fullscreen — would re-expand.
            />
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close fullscreen map"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 md:top-10 md:right-10 w-10 h-10 rounded-full bg-cream text-charcoal hover:bg-white shadow-lg flex items-center justify-center text-xl font-medium z-10"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
