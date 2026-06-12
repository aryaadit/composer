// POST /api/add-stop — extend an existing itinerary with another stop.
//
// Same shared pre-filter stack as /api/generate and /api/swap-stop, so
// the added stop can never violate budget, hours, neighborhood,
// exclusions, or closed status. proximity-to-Main is an additional
// constraint applied inside pickBestForRole.

import { NextResponse } from "next/server";
import { fetchActiveVenues } from "@/lib/venues/fetch-active";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  respondComposeFailure,
  respondComposeErrored,
} from "@/lib/itinerary/compose-failure-server";
import { fetchWeather } from "@/lib/weather";
import { pickBestForRole } from "@/lib/scoring";
import { STOP_1_POOL, disambiguateStop1Role, itineraryFits } from "@/lib/composer";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { fetchOrCacheWalkingRoute } from "@/lib/walking-routes";
import { calculateTotalSpend, spendEstimate } from "@/config/budgets";
import { applyPreFilters, buildPreFilterArgs } from "@/lib/itinerary/pre-filter";
import { computeRequestSeed, createSeededRandom } from "@/lib/itinerary/seed";
import { ALGORITHM } from "@/config/algorithm";
import {
  ItineraryResponse,
  ItineraryStop,
  WalkSegment,
  QuestionnaireAnswers,
} from "@/types";

interface AddStopRequest {
  itinerary: ItineraryResponse;
}

async function readDrinksPref(): Promise<{ userId: string | null; drinks: string | null }> {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { userId: null, drinks: null };
    const { data } = await supabase
      .from("composer_users")
      .select("drinks")
      .eq("id", user.id)
      .maybeSingle();
    return { userId: user.id, drinks: (data?.drinks as string | null) ?? null };
  } catch {
    return { userId: null, drinks: null };
  }
}

export async function POST(request: Request) {
  const distinctId = request.headers.get("x-ph-distinct-id");
  const sessionId = request.headers.get("x-ph-session-id");
  const addStartMs = performance.now();
  let analyticsUserId: string | null = null;
  let analyticsInputs: QuestionnaireAnswers | null = null;

  try {
    const { itinerary } = (await request.json()) as AddStopRequest;
    const { inputs, stops: currentStops } = itinerary;
    analyticsInputs = inputs;
    const lastStop = currentStops[currentStops.length - 1];
    if (!lastStop) {
      return NextResponse.json(
        { error: "No existing stops to extend" },
        { status: 400 }
      );
    }

    const mainStop = currentStops.find((s) => s.role === "main");
    if (!mainStop) {
      return NextResponse.json(
        { error: "No main stop to anchor extension" },
        { status: 400 }
      );
    }

    const [{ userId, drinks }, weather, venuesAll] = await Promise.all([
      readDrinksPref(),
      fetchWeather(),
      fetchActiveVenues().catch((err) => {
        console.error("[add-stop] fetchActiveVenues failed:", err);
        return null;
      }),
    ]);
    analyticsUserId = userId;

    if (venuesAll === null) {
      return NextResponse.json(
        { error: "Failed to fetch venues" },
        { status: 500 }
      );
    }

    const usedIds = new Set<string>();
    for (const s of currentStops) {
      usedIds.add(s.venue.id);
      if (s.plan_b) usedIds.add(s.plan_b.id);
    }

    const pre = applyPreFilters(
      buildPreFilterArgs({
        venues: venuesAll,
        inputs: {
          budget: inputs.budget,
          day: inputs.day,
          startTime: inputs.startTime,
          endTime: inputs.endTime,
          neighborhoods: inputs.neighborhoods ?? [],
        },
        exclude: usedIds,
        drinks,
      }),
    );
    if (!pre.ok) {
      return respondComposeFailure(pre.zeroingStage, "add-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
    }

    // Seeded PRNG keyed on inputs + the current usedIds + an
    // add-stop discriminator (rides in as a synthetic exclude marker
    // so the canonical seed shape is unchanged).
    const seed = computeRequestSeed({
      occasion: inputs.occasion,
      vibe: inputs.vibe,
      budget: inputs.budget,
      day: inputs.day,
      neighborhoods: inputs.neighborhoods,
      startTime: inputs.startTime,
      excludeVenueIds: [...Array.from(usedIds), "__add-stop"],
    });
    const random = createSeededRandom(seed);

    const { best, scored } = pickBestForRole(
      pre.venues,
      STOP_1_POOL,
      inputs,
      weather,
      usedIds,
      mainStop.venue,
      ALGORITHM.jitter.magnitude,
      random,
    );

    if (!best) {
      return respondComposeFailure("proximity", "add-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
    }

    // Proximity invariant vs the actual walk the user takes. The
    // pickBestForRole anchor above is mainStop.venue, so `best` is
    // within maxKm of Main. But the user walks from the EXISTING last
    // stop to the new one, not from Main — and for a 3-stop itinerary
    // where Main→lastStop is already near the cap, the candidate could
    // still be 2-3 km from lastStop. Mirror the swap-Main invariant
    // here so add-stop honors the same geographic contract /api/generate
    // would have produced.
    const maxKm = weather?.is_bad_weather
      ? ALGORITHM.distance.maxWalkKmBadWeather
      : ALGORITHM.distance.maxWalkKmNormal;
    const walkFromLast = walkDistanceKm(
      lastStop.venue.latitude,
      lastStop.venue.longitude,
      best.latitude,
      best.longitude,
    );
    if (walkFromLast > maxKm) {
      return respondComposeFailure("proximity", "add-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
    }

    // End-time fit invariant: the extended itinerary's projected
    // timeline must fit the user's window. add-stop appends a new
    // stop1-pool venue AFTER the current last stop; its duration +
    // the new walk could push the total past endTime.
    const extendedRole = disambiguateStop1Role(best);
    const extendedForFit = [
      ...currentStops.map((s) => ({ venue: s.venue, role: s.role })),
      { venue: best, role: extendedRole },
    ];
    if (!itineraryFits(extendedForFit, inputs.startTime, inputs.endTime)) {
      return respondComposeFailure("fit", "add-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
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

    const fallbackKm = walkDistanceKm(
      lastStop.venue.latitude,
      lastStop.venue.longitude,
      best.latitude,
      best.longitude,
    );
    const fallbackMinutes = walkTimeMinutes(
      lastStop.venue.latitude,
      lastStop.venue.longitude,
      best.latitude,
      best.longitude,
    );
    const newWalkRoute = await fetchOrCacheWalkingRoute(
      lastStop.venue.id,
      best.id,
      [lastStop.venue.longitude, lastStop.venue.latitude],
      [best.longitude, best.latitude],
      fallbackMinutes,
      Math.round(fallbackKm * 1000),
    );
    const newWalk: WalkSegment = {
      from: lastStop.venue.name,
      to: best.name,
      distance_km: newWalkRoute.routeGeometry
        ? newWalkRoute.walkDistanceMeters / 1000
        : fallbackKm,
      walk_minutes: newWalkRoute.walkMinutes,
      route_geometry: newWalkRoute.routeGeometry ?? undefined,
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
    // *_errored: 500-class system failure (the 422 *_failed branches
    // above are expected user-shape rejects). Added 2026-06-11 —
    // add-stop previously had no analytics analogue for catch-class
    // failures.
    console.error("Add-stop error:", error);
    return respondComposeErrored(
      error,
      "add-stop",
      analyticsInputs,
      { userId: analyticsUserId, distinctId, sessionId },
      Math.round(performance.now() - addStartMs),
    );
  }
}
