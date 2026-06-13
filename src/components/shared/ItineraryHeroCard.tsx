"use client";

// Pure presentational three-zone hero. Extracted from SavedPlanRowExpanded
// so both the soonest-upcoming saved plan and the daily Tonight's Pick can
// reuse the same layout without duplication.
//
//   Zone 1 — Text header on cream. Optional eyebrow (countdown copy +
//            urgency dot), serif title, meta line.
//   Zone 2 — Static Mapbox map with numbered burgundy pins (or hidden
//            when Mapbox returns null OR the image GET errors at runtime).
//   Zone 3 — Venue timeline with thumbnail · name · category · role.
//            Walk-minutes separator between stops.
//
// This component owns layout + visual treatment only. It does NOT
// render the outer interactive wrapper (Link / button) or any action
// affordances (rename / delete). Consumers wrap it accordingly.
//
// The `titleSlot` escape hatch is the single concession to the saved-
// plan rename UX: when present, it replaces the default <h2>{title}</h2>
// so the inline rename <input> can sit in the same DOM position as the
// title without breaking the byte-identical render contract.

import { useState, type ReactNode } from "react";
import type { LineString } from "geojson";
import type { ItineraryStop, WalkSegment } from "@/types";
import { buildItineraryStaticMapUrl } from "@/lib/mapbox";
import { getStopEyebrowLabel } from "@/lib/format/stop-eyebrow";
import { formatCategory } from "@/lib/format/category";
import { getVenueHeroImageUrl } from "@/lib/venues/images";

export type EyebrowUrgency = "today" | "tomorrow";

export interface HeroEyebrow {
  text: string;
  urgency?: EyebrowUrgency;
}

interface ItineraryHeroCardProps {
  /** Countdown-style header line + dot. Null when there's nothing to
   *  surface (e.g. a saved plan more than a day out). */
  eyebrow: HeroEyebrow | null;
  /** Serif title. Rendered inside <h2> by default; consumers can
   *  override the rendered element via `titleSlot`. */
  title: string;
  /** Pre-formatted "Day · Time · Neighborhood" line. Empty string
   *  hides the line entirely. */
  metaLine: string;
  stops: ItineraryStop[];
  walks: WalkSegment[];
  /** Escape hatch for callers that need to swap the default
   *  <h2>{title}</h2> for a different element (e.g. SavedPlanRowExpanded's
   *  inline rename <input>). */
  titleSlot?: ReactNode;
  /** When true, the hero wraps its zones in a surface with the
   *  burgundy-tint + burgundy/30 border recipe (the old
   *  TonightsPickCard teaser shading). Default false: hero renders
   *  as a fragment and the consumer wrapper provides the surface —
   *  the contract SavedPlanRowExpanded ships with. */
  tinted?: boolean;
}

export function ItineraryHeroCard({
  eyebrow,
  title,
  metaLine,
  stops,
  walks,
  titleSlot,
  tinted = false,
}: ItineraryHeroCardProps) {
  // Mapbox static URL. Defaults to the same 600×180@2x padding 60
  // recipe SavedPlanRowExpanded shipped. Null when token is missing
  // or no stop has finite coords. `mapErrored` switches to "hide map
  // zone" if the image GET fails at runtime (e.g. token's Static
  // Images scope isn't granted in the Mapbox dashboard).
  const mapUrl = buildItineraryStaticMapUrl(
    stops.map((s) => ({
      latitude: s.venue.latitude,
      longitude: s.venue.longitude,
    })),
    {
      routeGeometries: walks.map(
        (w) => (w.route_geometry as LineString | null | undefined) ?? null,
      ),
    },
  );
  const [mapErrored, setMapErrored] = useState(false);

  const zones = (
    <>
      {/* ─── Zone 1 — Text header ────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        {eyebrow && (
          <div
            data-testid="countdown"
            className={`flex items-center gap-2 font-sans text-[11px] tracking-widest uppercase mb-2 ${
              eyebrow.urgency === "today"
                ? "text-burgundy"
                : "text-burgundy/60"
            }`}
          >
            <span
              data-testid="countdown-dot"
              className={
                eyebrow.urgency === "today"
                  ? "inline-block w-1.5 h-1.5 rounded-full bg-burgundy"
                  : "inline-block w-1.5 h-1.5 rounded-full bg-burgundy/60"
              }
              aria-hidden
            />
            <span>{eyebrow.text}</span>
          </div>
        )}

        {titleSlot ?? (
          <h2 className="font-serif text-2xl text-charcoal leading-tight pr-20">
            {title}
          </h2>
        )}

        {metaLine && (
          <p className="font-sans text-sm text-muted mt-1">{metaLine}</p>
        )}
      </div>

      {/* ─── Zone 2 — Functional static map ──────────────── */}
      {mapUrl && !mapErrored && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapUrl}
          alt="Itinerary route map"
          className="w-full h-[180px] object-cover"
          loading="lazy"
          onError={() => setMapErrored(true)}
        />
      )}

      {/* ─── Zone 3 — Venue timeline ─────────────────────── */}
      {stops.length > 0 && (
        <div className="px-5 py-4">
          {stops.map((stop, i) => {
            const thumb = getVenueHeroImageUrl(stop.venue.image_keys ?? []);
            return (
              <div key={`${stop.venue.id}-${i}`}>
                <div className="flex items-center gap-3">
                  {/* Venue thumbnail (or first-letter fallback). The
                      row order matches the map's pin numbers, so an
                      explicit number on the timeline is redundant. */}
                  <div
                    data-testid="venue-thumbnail"
                    className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-burgundy/10 flex items-center justify-center"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={stop.venue.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        data-testid="thumbnail-fallback"
                        className="font-serif text-lg text-burgundy"
                      >
                        {stop.venue.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  {/* Name + category (left), role (right) */}
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-serif text-base text-charcoal truncate">
                        {stop.venue.name}
                      </div>
                      {stop.venue.category && (
                        <div className="font-sans text-xs text-muted mt-0.5">
                          {formatCategory(stop.venue.category)}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 font-sans text-[10px] tracking-widest uppercase text-muted whitespace-nowrap pt-1">
                      {getStopEyebrowLabel(stop, i, stops)}
                    </div>
                  </div>
                </div>

                {/* Walk separator — between stops only, not after the last */}
                {i < stops.length - 1 && walks[i] && (
                  <div
                    data-testid="walk-separator"
                    className="flex items-center gap-3 my-3 ml-6"
                  >
                    <span className="flex-1 border-t border-border" aria-hidden />
                    <span className="font-sans text-[11px] text-muted whitespace-nowrap">
                      {walks[i].walk_minutes} min walk
                    </span>
                    <span className="flex-1 border-t border-border" aria-hidden />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Tinted surface — burgundy-tint fill + burgundy/30 border (the old
  // TonightsPickCard teaser shading). When `tinted` is false the hero
  // stays a fragment and the consumer wrapper owns the surface, which
  // is what SavedPlanRowExpanded relies on for byte-identity.
  if (tinted) {
    return (
      <div
        data-testid="hero-tinted-surface"
        className="rounded-xl border border-burgundy/30 bg-burgundy-tint overflow-hidden transition-colors hover:border-burgundy/60"
      >
        {zones}
      </div>
    );
  }

  return zones;
}
