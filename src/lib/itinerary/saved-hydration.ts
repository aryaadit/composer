// Pure transform from a composer_saved_itineraries row into the
// ItineraryResponse shape the renderer expects. Extracted from the
// saved page so it can be unit-tested — the start_time round-trip
// fix added 2026-06-09 is the load-bearing case.
//
// Walk segments and maps_url are derived from venue coordinates here
// rather than persisted, because they're cheap to recompute and saved
// rows don't store them.

import {
  walkTimeMinutes,
  walkDistanceKm,
  buildGoogleMapsUrl,
} from "@/lib/geo";
import { calculateTotalSpend } from "@/config/budgets";
import {
  resolveTimeWindow,
  startTimeFromLegacyBlock,
} from "@/lib/itinerary/time-blocks";
import type {
  ItineraryResponse,
  ItineraryStop,
  SavedItinerary,
  WalkSegment,
} from "@/types";

export function rebuildWalks(stops: ItineraryStop[]): WalkSegment[] {
  const walks: WalkSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].venue;
    const b = stops[i + 1].venue;
    walks.push({
      from: a.name,
      to: b.name,
      distance_km: walkDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude),
      walk_minutes: walkTimeMinutes(a.latitude, a.longitude, b.latitude, b.longitude),
    });
  }
  return walks;
}

export function hydrateSavedItinerary(saved: SavedItinerary): ItineraryResponse {
  const stops = saved.stops ?? [];
  // Phase 10: prefer the persisted walks if the row has them (writes
  // post-2026-06-10 carry the full WalkSegment[] including
  // route_geometry). Fall back to rebuildWalks(stops) — straight-line
  // stubs from venue coords — for legacy rows where saved.walks is null
  // or missing. Both branches return the same WalkSegment[] shape, so
  // every downstream caller (ItineraryView, ItineraryMap, walking-meta
  // calculation below) is agnostic to which branch fired.
  const walks: WalkSegment[] =
    saved.walks && saved.walks.length > 0
      ? saved.walks
      : rebuildWalks(stops);
  // Prefer the explicitly persisted start_time. Fall back to the legacy
  // time_block bucket mapping for rows that predate the start_time column.
  const startTime = saved.start_time ?? startTimeFromLegacyBlock(saved.time_block);
  const { endTime } = resolveTimeWindow(startTime);
  return {
    header: {
      title: saved.custom_name || saved.title || "Saved plan",
      subtitle: saved.subtitle ?? "",
      occasion_tag: saved.occasion ?? "",
      vibe_tag: saved.vibe ?? "",
      estimated_total: calculateTotalSpend(stops.map((s) => s.venue.price_tier ?? 2)),
      weather: saved.weather,
    },
    stops,
    walks,
    walking:
      saved.walking ?? {
        longest_walk_min: walks.reduce((m, w) => Math.max(m, w.walk_minutes), 0),
        total_walk_min: walks.reduce((s, w) => s + w.walk_minutes, 0),
        any_over_cap: false,
        cap_min: 15,
      },
    maps_url: buildGoogleMapsUrl(stops.map((s) => s.venue)),
    // Budget is cast through the wider DB type since old saves can
    // carry "all_out" / "no_preference"; ComposeBudget would reject
    // them at the type level.
    inputs: {
      occasion: (saved.occasion ?? "") as ItineraryResponse["inputs"]["occasion"],
      neighborhoods: (saved.neighborhoods ?? []) as ItineraryResponse["inputs"]["neighborhoods"],
      budget: (saved.budget ?? "") as ItineraryResponse["inputs"]["budget"],
      vibe: (saved.vibe ?? "") as ItineraryResponse["inputs"]["vibe"],
      day: saved.day ?? "",
      startTime,
      endTime,
    },
  };
}
