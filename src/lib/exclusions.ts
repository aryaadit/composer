// Best-effort venue exclusion from recent saved plans.
// Fetches the user's last 3 saved itineraries (within 30 days) and
// collects their venue IDs. Returns [] on any error — exclusion is a
// quality-of-life improvement, never a blocker.

import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { SavedItinerary } from "@/types";

export async function getRecentVenueIds(userId: string): Promise<string[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const { data, error } = await getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("stops")
      .eq("user_id", userId)
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false })
      .limit(3);

    if (error || !data) return [];

    const ids = new Set<string>();
    for (const row of data as Pick<SavedItinerary, "stops">[]) {
      if (!Array.isArray(row.stops)) continue;
      for (const stop of row.stops) {
        if (stop?.venue?.id) ids.add(stop.venue.id);
      }
    }
    return Array.from(ids);
  } catch {
    return [];
  }
}
