// POST /api/swap-stop — replace one stop in an existing itinerary.
//
// Reuses pickBestForRole with the same scoring/proximity rules as the
// initial generation. Returns the replacement stop + adjacent walk
// segments so the client can patch in-place.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics-server";
import { fetchWeather } from "@/lib/weather";
import { pickBestForRole } from "@/lib/scoring";
import { enrichWithAvailability } from "@/lib/itinerary/availability-enrichment";
import {
  walkTimeMinutes,
  walkDistanceKm,
  buildGoogleMapsUrl,
} from "@/lib/geo";
import { calculateTotalSpend, spendEstimate } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import type {
  Venue,
  ItineraryResponse,
  ItineraryStop,
  WalkSegment,
} from "@/types";

interface SwapRequest {
  itinerary: ItineraryResponse;
  stopIndex: number;
  excludeVenueIds: string[];
}

async function readDrinksPref(): Promise<string | null> {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("composer_users")
      .select("drinks")
      .eq("id", user.id)
      .maybeSingle();
    return (data?.drinks as string | null) ?? null;
  } catch {
    return null;
  }
}

function buildWalk(from: Venue, to: Venue): WalkSegment {
  return {
    from: from.name,
    to: to.name,
    distance_km: walkDistanceKm(
      from.latitude, from.longitude, to.latitude, to.longitude
    ),
    walk_minutes: walkTimeMinutes(
      from.latitude, from.longitude, to.latitude, to.longitude
    ),
  };
}

export async function POST(request: Request) {
  const distinctId = request.headers.get("x-ph-distinct-id");
  const sessionId = request.headers.get("x-ph-session-id");

  try {
    const { itinerary, stopIndex, excludeVenueIds } =
      (await request.json()) as SwapRequest;

    const { inputs, stops: currentStops } = itinerary;
    if (stopIndex < 0 || stopIndex >= currentStops.length) {
      return NextResponse.json({ error: "Invalid stop index" }, { status: 400 });
    }

    const stopToReplace = currentStops[stopIndex];

    const [drinks, weather, venueResult] = await Promise.all([
      readDrinksPref(),
      fetchWeather(),
      getSupabase().from("composer_venues_v2").select("*").eq("active", true),
    ]);

    if (venueResult.error) {
      return NextResponse.json(
        { error: "Failed to fetch venues" },
        { status: 500 }
      );
    }

    let venues = venueResult.data as Venue[];

    if (drinks === "no") {
      venues = venues.filter(
        (v) => !v.vibe_tags.some((t) => ALCOHOL_VIBE_TAGS.has(t))
      );
    }

    // Exclude every venue already in the itinerary + any the user
    // previously rejected for this slot.
    const usedIds = new Set<string>(excludeVenueIds);
    for (const s of currentStops) {
      usedIds.add(s.venue.id);
      if (s.plan_b) usedIds.add(s.plan_b.id);
    }

    // Anchor on Main for geographic coherence (unless we're swapping
    // Main itself, in which case pick freely).
    const mainStop = currentStops.find((s) => s.role === "main");
    const anchor =
      stopToReplace.role === "main" ? null : (mainStop?.venue ?? null);

    const { best, scored } = pickBestForRole(
      venues,
      stopToReplace.role,
      inputs,
      weather,
      usedIds,
      anchor,
      10
    );

    if (!best) {
      return NextResponse.json(
        { error: "No other good matches — try adjusting your filters" },
        { status: 404 }
      );
    }

    const planB = scored.find((v) => v.id !== best.id) ?? null;

    const newStop: ItineraryStop = {
      role: stopToReplace.role,
      venue: best,
      curation_note: best.curation_note ?? "",
      spend_estimate: spendEstimate(best.price_tier ?? 2),
      is_fixed: false,
      plan_b: planB,
    };

    // Enrich the new stop with Resy availability so the StopAvailability
    // widget renders (status, slots, bookingUrlBase). Wrap-and-extract:
    // enrichWithAvailability operates on a whole ItineraryResponse, so
    // we build a minimal one containing just newStop, enrich it, and
    // pull the enriched stop back out. candidatePool=undefined disables
    // the recursive swap-on-empty-slots — we're already in a swap.
    const fakeResponse: ItineraryResponse = {
      ...itinerary,
      stops: [newStop],
    };
    const enrichedFake = await enrichWithAvailability(
      fakeResponse,
      inputs.day,
      2, // default party size — matches /api/generate
      { startTime: inputs.startTime, endTime: inputs.endTime },
      undefined
    );
    const enrichedStop = enrichedFake.stops[0];

    // Recompute only the walks adjacent to the swapped stop.
    const walkBefore =
      stopIndex > 0
        ? buildWalk(currentStops[stopIndex - 1].venue, best)
        : null;
    const walkAfter =
      stopIndex < currentStops.length - 1
        ? buildWalk(best, currentStops[stopIndex + 1].venue)
        : null;

    // Rebuild summary fields from the patched stop list.
    const patchedVenues = currentStops.map((s, i) =>
      i === stopIndex ? best : s.venue
    );

    // Track stop swap server-side so it's correlated with itinerary_generated.
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const fromVenue = stopToReplace.venue;
    void trackServer(
      "stop_swapped",
      { userId: user?.id ?? null, distinctId, sessionId },
      {
        stop_index: stopIndex,
        stop_role: stopToReplace.role,
        from_venue_id: fromVenue.id,
        from_venue_name: fromVenue.name,
        from_neighborhood: fromVenue.neighborhood,
        from_category: fromVenue.category ?? null,
        to_venue_id: best.id,
        to_venue_name: best.name,
        to_neighborhood: best.neighborhood,
        to_category: best.category ?? null,
        occasion: inputs.occasion,
        vibe: inputs.vibe,
      }
    );

    return NextResponse.json({
      stop: enrichedStop,
      walks: { before: walkBefore, after: walkAfter },
      maps_url: buildGoogleMapsUrl(patchedVenues),
      estimated_total: calculateTotalSpend(
        patchedVenues.map((v) => v.price_tier ?? 2)
      ),
    });
  } catch (error) {
    console.error("[swap-stop] error:", error);
    return NextResponse.json(
      { error: "Failed to swap stop" },
      { status: 500 }
    );
  }
}
