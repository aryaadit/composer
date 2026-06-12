// Single-source save helper. Wraps the composer_saved_itineraries
// INSERT with the same column set ActionBar.handleSave used to do.
// Extracted in Phase 7 so the new LooksGoodCTA + (a future restored)
// ActionBar both call this rather than duplicating the INSERT body.

import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { ItineraryResponse } from "@/types";

export async function saveItineraryToSupabase(
  itinerary: ItineraryResponse,
  userId: string,
): Promise<string> {
  const { inputs, header, stops, walks, walking } = itinerary;
  const { data, error } = await getBrowserSupabase()
    .from("composer_saved_itineraries")
    .insert({
      user_id: userId,
      title: header.title,
      subtitle: header.subtitle,
      occasion: inputs.occasion,
      neighborhoods: inputs.neighborhoods,
      budget: inputs.budget,
      vibe: inputs.vibe,
      day: inputs.day,
      start_time: inputs.startTime,
      // Legacy NOT NULL column. The authoritative start time lives in
      // `start_time` (Phase 1 fidelity fix); `time_block` will be
      // dropped once nothing reads it (Phase 1 backlog).
      time_block: "evening",
      // Entry mode — drives the lucky-itinerary crown treatment on
      // re-open via isLuckyItinerary(itinerary.inputs). Persisted as
      // of the 20260612_add_mode_to_saved_itineraries migration; null
      // when the questionnaire path didn't tag the request (old
      // analytics convention). Without writing it here the field gets
      // dropped on save because composer_saved_itineraries stores
      // inputs as typed columns, not as a JSONB blob.
      mode: inputs.mode ?? null,
      stops,
      // Phase 10: persist the per-segment WalkSegment[] (with
      // route_geometry from composer_walking_routes) so the home hero's
      // static map and the saved-page interactive map can render the
      // real street-following polylines instead of straight-line stubs
      // reconstituted from venue coords. Requires the
      // 20260610_add_walks_to_saved_itineraries migration; without it
      // the INSERT errors on an unknown column.
      walks,
      walking,
      weather: header.weather,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Save returned no id");
  return data.id as string;
}
