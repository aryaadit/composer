"use client";

// Tonight's Pick — daily seeded itinerary, rendered on home as the
// SAME three-zone hero as the soonest-upcoming saved plan (countdown
// header + static map + venue timeline). Reuses `ItineraryHeroCard`
// so layout and visual treatment never drift between the two
// surfaces. Labeled "Tonight's pick · from us" so users can tell
// ours apart from their own saved plans at a glance.
//
// Render gate (lives in HomeScreen): only when the daily-pick fetch
// is "ready" AND the user has no saved plan for tonight. When a
// tonight-plan exists it already occupies the upcoming hero slot,
// so the pick steps aside.
//
// Tap → sessionStorage handoff to /itinerary + DAILY_PICK_OPENED
// analytics event. Identical to the pre-2026-06-13 teaser; only the
// presentation changed.

import { useRouter } from "next/navigation";
import type { ItineraryResponse, GenerateRequestBody } from "@/types";
import { STORAGE_KEYS } from "@/config/storage";
import { EVENTS, track } from "@/lib/analytics";
import { formatShortDateLabel } from "@/lib/dateUtils";
import { formatStartTimeLabel } from "@/lib/itinerary/time-blocks";
import { neighborhoodLabel } from "@/config/neighborhoods";
import { rebuildWalks } from "@/lib/itinerary/saved-hydration";
import { ItineraryHeroCard } from "@/components/shared/ItineraryHeroCard";

interface TonightsPickHeroProps {
  inputs: GenerateRequestBody;
  itinerary: ItineraryResponse;
  pickDate: string;
}

export function TonightsPickHero({
  inputs,
  itinerary,
  pickDate,
}: TonightsPickHeroProps) {
  const router = useRouter();

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

  const title = itinerary.header?.title ?? "A plan for tonight";

  // Meta line: same Day · Time · Neighborhood shape SavedPlanRowExpanded
  // uses, fed from the pick's inputs. Anything that resolves to ""
  // falls out of the join so the line stays clean.
  const dayLabel = formatShortDateLabel(inputs.day);
  const startLabel = formatStartTimeLabel(inputs.startTime);
  const firstNeighborhood = inputs.neighborhoods?.[0];
  const neighborhoodSegment = firstNeighborhood
    ? neighborhoodLabel(firstNeighborhood)
    : "";
  const metaLine = [dayLabel, startLabel, neighborhoodSegment]
    .filter((s) => s.length > 0)
    .join(" · ");

  // Walks: prefer the response's persisted walks (carry real Mapbox
  // route_geometry) so the map renders the same street-following
  // polylines a saved itinerary would. Fall back to the straight-line
  // rebuild only if the daily-pick response somehow shipped without
  // walks.
  const walks =
    itinerary.walks && itinerary.walks.length > 0
      ? itinerary.walks
      : rebuildWalks(itinerary.stops);

  return (
    <section
      data-testid="tonights-pick-hero"
      className="w-full max-w-lg mx-auto mb-6 px-6"
    >
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open tonight's pick"
        className="w-full text-left rounded-xl border border-burgundy/30 bg-cream overflow-hidden transition-colors hover:border-burgundy/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/50"
      >
        <ItineraryHeroCard
          eyebrow={{
            text: "Tonight’s pick · from us",
            urgency: "today",
          }}
          title={title}
          metaLine={metaLine}
          stops={itinerary.stops}
          walks={walks}
        />
      </button>
    </section>
  );
}
