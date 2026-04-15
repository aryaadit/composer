import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/weather";
import { pickBestForRole } from "@/lib/scoring";
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

    const [drinks, weather, venueResult] = await Promise.all([
      readDrinksPref(),
      fetchWeather(),
      getSupabase().from("composer_venues").select("*").eq("active", true),
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

    // Exclude every venue already in the itinerary, including current Plan Bs.
    const usedIds = new Set<string>();
    for (const s of currentStops) {
      usedIds.add(s.venue.id);
      if (s.plan_b) usedIds.add(s.plan_b.id);
    }

    // Anchor on the last stop and pick another closer — the natural extension
    // of a night (one more drink, dessert, late bar).
    const { best, scored } = pickBestForRole(
      venues,
      "closer",
      inputs,
      weather,
      usedIds,
      lastStop.venue,
      10
    );

    if (!best) {
      return NextResponse.json(
        { error: "No nearby venues available to extend" },
        { status: 404 }
      );
    }

    const planB = scored.find((v) => v.id !== best.id) ?? null;

    const newStop: ItineraryStop = {
      role: "closer",
      venue: best,
      curation_note: best.curation_note,
      spend_estimate: spendEstimate(best.price_tier),
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
      allVenues.map((v) => v.price_tier)
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
