// POST /api/swap-stop — replace one stop in an existing itinerary.
//
// Reuses pickBestForRole + the canonical pre-filter stack so a swap can
// never return a venue that /api/generate's strict filters would have
// rejected. Returns the replacement stop + adjacent walk segments so
// the client can patch in-place, or a structured ComposeFailure when
// the pool empties.

import { NextResponse } from "next/server";
import { fetchActiveVenues } from "@/lib/venues/fetch-active";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  trackServer,
  EVENTS,
  buildComposeContext,
  buildItineraryContext,
} from "@/lib/analytics-server";
import { fetchWeather } from "@/lib/weather";
import { pickBestForRole } from "@/lib/scoring";
import { itineraryFits, isBarEligible } from "@/lib/composer";
import { enrichWithAvailability } from "@/lib/itinerary/availability-enrichment";
import {
  walkTimeMinutes,
  walkDistanceKm,
  buildGoogleMapsUrl,
} from "@/lib/geo";
import { fetchOrCacheWalkingRoute } from "@/lib/walking-routes";
import { calculateTotalSpend, spendEstimate } from "@/config/budgets";
import { applyPreFilters, buildPreFilterArgs } from "@/lib/itinerary/pre-filter";
import {
  respondComposeFailure,
  respondComposeErrored,
} from "@/lib/itinerary/compose-failure-server";
import { computeRequestSeed, createSeededRandom } from "@/lib/itinerary/seed";
import { ALGORITHM } from "@/config/algorithm";
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

async function buildWalk(from: Venue, to: Venue): Promise<WalkSegment> {
  const fallbackMinutes = walkTimeMinutes(
    from.latitude, from.longitude, to.latitude, to.longitude,
  );
  const fallbackKm = walkDistanceKm(
    from.latitude, from.longitude, to.latitude, to.longitude,
  );
  const route = await fetchOrCacheWalkingRoute(
    from.id,
    to.id,
    [from.longitude, from.latitude],
    [to.longitude, to.latitude],
    fallbackMinutes,
    Math.round(fallbackKm * 1000),
  );
  return {
    from: from.name,
    to: to.name,
    distance_km: route.routeGeometry
      ? route.walkDistanceMeters / 1000
      : fallbackKm,
    walk_minutes: route.walkMinutes,
    route_geometry: route.routeGeometry ?? undefined,
  };
}

export async function POST(request: Request) {
  const distinctId = request.headers.get("x-ph-distinct-id");
  const sessionId = request.headers.get("x-ph-session-id");
  // Captured before the try so the catch can attribute compose_errored
  // to the right person and inputs even when the body parse threw.
  const swapStartMs = performance.now();
  let analyticsUserId: string | null = null;
  let analyticsInputs: SwapRequest["itinerary"]["inputs"] | null = null;

  try {
    const { itinerary, stopIndex, excludeVenueIds } =
      (await request.json()) as SwapRequest;

    const { inputs, stops: currentStops } = itinerary;
    analyticsInputs = inputs;
    if (stopIndex < 0 || stopIndex >= currentStops.length) {
      return NextResponse.json({ error: "Invalid stop index" }, { status: 400 });
    }

    const stopToReplace = currentStops[stopIndex];

    const [{ userId, drinks }, weather, venuesAll] = await Promise.all([
      readDrinksPref(),
      fetchWeather(),
      fetchActiveVenues().catch((err) => {
        console.error("[swap-stop] fetchActiveVenues failed:", err);
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

    // Exclusion set: client-supplied rejects + every current stop +
    // every plan_b — same monotonic shape as before, NO graceful trim.
    const usedIds = new Set<string>(excludeVenueIds);
    for (const s of currentStops) {
      usedIds.add(s.venue.id);
      if (s.plan_b) usedIds.add(s.plan_b.id);
    }

    // Strict shared pre-filter stack — identical predicates and order
    // to /api/generate. No widening, no relaxation, no per-endpoint
    // skip. Neighborhood is now enforced here at the data layer; the
    // proximity-to-Main cap inside pickBestForRole is an ADDITIONAL
    // geographic constraint, not a substitute for honoring the user's
    // neighborhood pick.
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
      return respondComposeFailure(pre.zeroingStage, "swap-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
    }

    // Drinks-night bar filter — same predicate composeDrinks uses on
    // both stop pools during /api/generate, so a swap on a Drinks
    // itinerary can't return a venue the original composition would
    // have rejected (a dessert shop tagged ["closer"], a restaurant
    // tagged ["main","closer"], etc.). pickBestForRole's role gate
    // alone is too permissive here: STOP_1_POOL = {opener, closer},
    // and a restaurant with stop_roles=["main","closer"] passes that
    // gate even though it's a Main, not a bar. isBarEligible plugs
    // the leak. Drinks itineraries never have a Main stop today, so
    // stopToReplace.role is always opener or closer — but we apply
    // the gate symmetrically so a future composeDrinks shape change
    // doesn't silently introduce non-bar swaps.
    const drinksPool =
      inputs.vibe === "drinks_led"
        ? pre.venues.filter(isBarEligible)
        : pre.venues;
    if (drinksPool.length === 0) {
      return respondComposeFailure("proximity", "swap-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
    }

    // Anchor on Main for non-Main swaps. For swap-Main the anchor is
    // null — but neighborhood is already enforced via the pre-filter,
    // so the "anchor=null cascades inside scoring" behavior the old
    // regime depended on is gone. proximity stays an additional
    // constraint when anchor is non-null.
    const mainStop = currentStops.find((s) => s.role === "main");
    const anchor =
      stopToReplace.role === "main" ? null : (mainStop?.venue ?? null);

    // Hygiene: seeded PRNG keyed on inputs + the growing exclude set
    // so successive swaps converge deterministically without the
    // Math.random non-determinism the audit flagged.
    // ALGORITHM.jitter.magnitude replaces the prior hardcoded literal
    // 10. Swap context (stopIndex / role) rides in as synthetic
    // exclude markers so the seed varies per swap target without
    // changing the canonical seed shape.
    const swapContextMarker = `__swap:${stopIndex}:${stopToReplace.role}`;
    const seed = computeRequestSeed({
      occasion: inputs.occasion,
      vibe: inputs.vibe,
      budget: inputs.budget,
      day: inputs.day,
      neighborhoods: inputs.neighborhoods,
      startTime: inputs.startTime,
      excludeVenueIds: [...Array.from(usedIds), swapContextMarker],
    });
    const random = createSeededRandom(seed);

    const { best, scored } = pickBestForRole(
      drinksPool,
      stopToReplace.role,
      inputs,
      weather,
      usedIds,
      anchor,
      ALGORITHM.jitter.magnitude,
      random,
    );

    if (!best) {
      // Pre-filter cleared every user-input stage; per-role cascade
      // exhausted too. Honest failure — almost always proximity (no
      // role-eligible venue within walking range of Main for non-Main
      // swaps; no role-eligible venue at all for swap-Main).
      return respondComposeFailure("proximity", "swap-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
    }

    // Invariant: when the swapped stop is Main, the candidate Main must
    // satisfy the proximity cap against EVERY remaining stop, not just
    // the one anchor. pickBestForRole only enforces proximity against
    // the passed anchor (null in this branch). Without this check, a
    // swap-Main could ship a Main that's farther from the existing
    // opener/closer than the strict generate cascade would have
    // allowed.
    if (stopToReplace.role === "main") {
      const maxKm = weather?.is_bad_weather
        ? ALGORITHM.distance.maxWalkKmBadWeather
        : ALGORITHM.distance.maxWalkKmNormal;
      const others = currentStops.filter((_, i) => i !== stopIndex);
      const tooFar = others.some(
        (other) =>
          walkDistanceKm(
            best.latitude,
            best.longitude,
            other.venue.latitude,
            other.venue.longitude,
          ) > maxKm,
      );
      if (tooFar) {
        return respondComposeFailure("proximity", "swap-stop", inputs, {
          userId,
          distinctId,
          sessionId,
        });
      }
    }

    // End-time fit invariant: the patched itinerary's projected
    // timeline must fit the user's window. Replaces a swap of a short
    // venue with a long one cannot silently push Main past endTime.
    const patchedForFit = currentStops.map((s, i) =>
      i === stopIndex ? { venue: best, role: s.role } : { venue: s.venue, role: s.role },
    );
    if (!itineraryFits(patchedForFit, inputs.startTime, inputs.endTime)) {
      return respondComposeFailure("fit", "swap-stop", inputs, {
        userId,
        distinctId,
        sessionId,
      });
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
    // widget renders. Wrap-and-extract: enrichWithAvailability operates
    // on a whole ItineraryResponse, so we build a minimal one and pull
    // the enriched stop back out. candidatePool=undefined disables the
    // recursive swap-on-empty-slots — we're already in a swap.
    const fakeResponse: ItineraryResponse = {
      ...itinerary,
      stops: [newStop],
    };
    const enrichedFake = await enrichWithAvailability(
      fakeResponse,
      inputs.day,
      ALGORITHM.composition.defaultPartySize,
      { startTime: inputs.startTime, endTime: inputs.endTime },
      undefined
    );
    const enrichedStop = enrichedFake.stops[0];

    const [walkBefore, walkAfter] = await Promise.all([
      stopIndex > 0
        ? buildWalk(currentStops[stopIndex - 1].venue, best)
        : Promise.resolve(null),
      stopIndex < currentStops.length - 1
        ? buildWalk(best, currentStops[stopIndex + 1].venue)
        : Promise.resolve(null),
    ]);

    const patchedVenues = currentStops.map((s, i) =>
      i === stopIndex ? best : s.venue
    );

    const fromVenue = stopToReplace.venue;
    void trackServer(
      EVENTS.STOP_SWAPPED,
      { userId, distinctId, sessionId },
      {
        ...buildComposeContext(inputs),
        // /api/swap-stop receives an ItineraryResponse without an `id`
        // (the saved/share id lives elsewhere in the client and isn't
        // threaded through). Passing null keeps the ItineraryRef shape
        // honest — see buildItineraryContext.
        ...buildItineraryContext(null),
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
    // *_errored: 500-class system failure (the 422 *_failed branches above
    // are expected user-shape rejects). Added 2026-06-11 — swap-stop
    // previously had no analytics analogue for catch-class failures.
    console.error("[swap-stop] error:", error);
    return respondComposeErrored(
      error,
      "swap-stop",
      analyticsInputs,
      { userId: analyticsUserId, distinctId, sessionId },
      Math.round(performance.now() - swapStartMs),
    );
  }
}
