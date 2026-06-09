import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/weather";
import { pickBestForRole } from "@/lib/scoring";
import { STOP_1_POOL, disambiguateStop1Role } from "@/lib/composer";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { buildWalkMapUrl } from "@/lib/mapbox";
import { calculateTotalSpend, spendEstimate } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import {
  Venue,
  ItineraryResponse,
  ItineraryStop,
  WalkSegment,
} from "@/types";

interface AddStopRequest {
  itinerary: ItineraryResponse;
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

export async function POST(request: Request) {
  try {
    const { itinerary } = (await request.json()) as AddStopRequest;
    const { inputs, stops: currentStops } = itinerary;
    const lastStop = currentStops[currentStops.length - 1];
    if (!lastStop) {
      return NextResponse.json(
        { error: "No existing stops to extend" },
        { status: 400 }
      );
    }

    // Anchor on Main explicitly — Phase 2 collapsed the base shape to
    // [stop_1, main], so "last stop" and Main are usually the same, but
    // pinning to Main avoids surprises if the stop list is ever reordered
    // or if a future surface extends a 3-stop saved itinerary.
    const mainStop = currentStops.find((s) => s.role === "main");
    if (!mainStop) {
      return NextResponse.json(
        { error: "No main stop to anchor extension" },
        { status: 400 }
      );
    }

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

    // Drinks filter — same rule as the generate route.
    if (drinks === "no") {
      venues = venues.filter(
        (v) => !v.vibe_tags.some((t) => ALCOHOL_VIBE_TAGS.has(t))
      );
    }

    // Exclude every venue already in the itinerary, including current
    // Plan Bs. The spec calls out "EXCLUDES the venue used in stop 1"
    // explicitly — that's covered here by adding every current stop.
    const usedIds = new Set<string>();
    for (const s of currentStops) {
      usedIds.add(s.venue.id);
      if (s.plan_b) usedIds.add(s.plan_b.id);
    }

    // Pick from STOP_1_POOL (opener-or-closer canonical) anchored to
    // Main. Phase 2 replaced the always-"closer" rule with the same
    // pool that drives stop 1 — adding a stop is a sibling of stop 1,
    // not a "nightcap" suffix.
    const { best, scored } = pickBestForRole(
      venues,
      STOP_1_POOL,
      inputs,
      weather,
      usedIds,
      mainStop.venue,
      10
    );

    if (!best) {
      return NextResponse.json(
        { error: "No nearby venues available to extend" },
        { status: 404 }
      );
    }

    const planB = scored.find((v) => v.id !== best.id) ?? null;
    const addedRole = disambiguateStop1Role(best);

    const newStop: ItineraryStop = {
      role: addedRole,
      venue: best,
      curation_note: best.curation_note ?? "",
      spend_estimate: spendEstimate(best.price_tier ?? 2),
      is_fixed: false,
      plan_b: planB,
    };

    const newWalk: WalkSegment = {
      from: lastStop.venue.name,
      to: best.name,
      distance_km: walkDistanceKm(
        lastStop.venue.latitude,
        lastStop.venue.longitude,
        best.latitude,
        best.longitude
      ),
      walk_minutes: walkTimeMinutes(
        lastStop.venue.latitude,
        lastStop.venue.longitude,
        best.latitude,
        best.longitude
      ),
      map_url: await buildWalkMapUrl(
        lastStop.venue.latitude,
        lastStop.venue.longitude,
        best.latitude,
        best.longitude
      ),
    };

    const allVenues = [...currentStops.map((s) => s.venue), best];
    const maps_url = buildGoogleMapsUrl(allVenues);
    const estimated_total = calculateTotalSpend(
      allVenues.map((v) => v.price_tier ?? 2)
    );

    return NextResponse.json({
      stop: newStop,
      walk: newWalk,
      maps_url,
      estimated_total,
    });
  } catch (error) {
    console.error("Add-stop error:", error);
    return NextResponse.json(
      { error: "Failed to add stop" },
      { status: 500 }
    );
  }
}
