// Best-effort venue exclusion from recent saved plans.
// Fetches the user's last 3 saved itineraries (or anything within 30 days,
// whichever is larger) and collects their venue IDs. Returns [] on any
// error — exclusion is a quality-of-life improvement, never a blocker.

import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { SavedItinerary } from "@/types";

export async function getRecentVenueIds(
  userId: string
): Promise<string[]> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString();

    // Fetch the 3 most recent plans. RLS ensures we only see this user's
    // rows. The 30-day filter is additive — if the user has 5 plans from
    // the last week, we still only look at the top 3 by recency. If they
    // have 2 plans from 25 days ago, both are included.
    const { data, error } = await getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("stops")
      .eq("user_id", userId)
      .gte("created_at", cutoff)
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
