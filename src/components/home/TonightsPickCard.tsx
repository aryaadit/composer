"use client";

// Tonight's Pick — a daily seeded itinerary card on the home page.
// Visual family: same Mapbox-thumbnail-over-stops shape as the saved
// hero card, but unmistakably distinct so it never reads as one of
// the user's saved plans.
//
// Distinguishers:
//   - Eyebrow: "TONIGHT'S PICK · FROM US" (uppercase, burgundy dot).
//     Two label options to propose in the PR description besides the
//     default below: "ON THE HOUSE", "TONIGHT, OUR TAKE".
//   - Burgundy-tinted fill (var(--color-burgundy-tint)) instead of
//     plain cream.
//   - Burgundy/30 border (vs the saved card's burgundy/15).
//
// Tap → write the cached inputs + itinerary to the same sessionStorage
// keys the questionnaire uses, navigate to /itinerary. The page has no
// idea this came from the daily pick — swap/save work normally. Viewing
// never auto-saves; saving is the user's action via Looks Good.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LineString } from "geojson";
import { buildItineraryStaticMapUrl } from "@/lib/mapbox";
import { ROLE_LABELS } from "@/config/roles";
import { formatCategory } from "@/lib/format/category";
import { STORAGE_KEYS } from "@/config/storage";
import { EVENTS, track } from "@/lib/analytics";
import type { ItineraryResponse, GenerateRequestBody } from "@/types";

interface TonightsPickCardProps {
  inputs: GenerateRequestBody;
  itinerary: ItineraryResponse;
  pickDate: string;
}

export function TonightsPickCard({
  inputs,
  itinerary,
  pickDate,
}: TonightsPickCardProps) {
  const router = useRouter();
  const stops = itinerary.stops;
  const walks = itinerary.walks ?? [];

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
  // Runtime Mapbox failure (token scope, transient 4xx) — mirror the
  // SavedPlanRowExpanded pattern so the card hides the map zone
  // instead of leaving a broken-image artifact.
  const [mapErrored, setMapErrored] = useState(false);

  const handleOpen = () => {
    track(EVENTS.DAILY_PICK_OPENED, {
      itinerary_id: null,
      pick_date: pickDate,
    });
    // Standard handoff — same sessionStorage keys, same /itinerary
    // page. Lucky uses the identical pattern. No new render path.
    sessionStorage.setItem(
      STORAGE_KEYS.session.questionnaireInputs,
      JSON.stringify(inputs),
    );
    sessionStorage.setItem(
      STORAGE_KEYS.session.currentItinerary,
      JSON.stringify(itinerary),
    );
    router.push("/itinerary");
  };

  return (
    <section
      data-testid="tonights-pick-card"
      className="w-full max-w-lg mx-auto mb-8 px-6"
    >
      <button
        type="button"
        onClick={handleOpen}
        className="group block w-full text-left rounded-xl border border-burgundy/30 bg-burgundy-tint overflow-hidden hover:border-burgundy/60 transition-colors"
      >
        {/* ─── Eyebrow ─────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-3">
          <div
            data-testid="tonights-pick-eyebrow"
            className="flex items-center gap-2 font-sans text-[11px] tracking-widest uppercase text-burgundy mb-2"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-burgundy"
              aria-hidden
            />
            <span>Tonight&apos;s pick &middot; from us</span>
          </div>

          {/* ─── Title from the generated header copy ─────── */}
          <h2 className="font-serif text-2xl text-charcoal leading-tight">
            {itinerary.header?.title ?? "A plan for tonight"}
          </h2>
          {itinerary.header?.subtitle && (
            <p className="font-sans text-sm text-warm-gray mt-1">
              {itinerary.header.subtitle}
            </p>
          )}
        </div>

        {/* ─── Map thumbnail (hidden gracefully on build-time AND
              runtime Mapbox miss; matches SavedPlanRowExpanded). ─── */}
        {mapUrl && !mapErrored && (
          <div className="w-full bg-cream-dark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mapUrl}
              alt=""
              className="w-full block"
              loading="lazy"
              onError={() => setMapErrored(true)}
            />
          </div>
        )}

        {/* ─── Two stops, same role-line treatment as saved cards ─ */}
        <ul className="divide-y divide-burgundy/10">
          {stops.slice(0, 2).map((stop, i) => (
            <li
              key={stop.venue.id}
              className="flex items-baseline gap-3 px-5 py-3"
            >
              <span
                className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-burgundy text-cream font-sans text-[11px] font-medium"
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-base text-charcoal leading-snug truncate">
                  {stop.venue.name}
                </p>
                <p className="font-sans text-xs text-muted mt-0.5">
                  {ROLE_LABELS[stop.role] ?? stop.role}
                  {stop.venue.category && (
                    <> &middot; {formatCategory(stop.venue.category)}</>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </button>
    </section>
  );
}
