// POST /api/swap-stop — replace one stop in an existing itinerary.
//
// Reuses pickBestForRole with the same scoring/proximity rules as the
// initial generation. Returns the replacement stop + adjacent walk
// segments so the client can patch in-place.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/weather";
import { pickBestForRole } from "@/lib/scoring";
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

    return NextResponse.json({
      stop: newStop,
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
