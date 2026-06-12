import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchActiveVenues } from "@/lib/venues/fetch-active";
import {
  trackServer,
  EVENTS,
  buildComposeContext,
} from "@/lib/analytics-server";
import { fetchWeather } from "@/lib/weather";
import { composeItinerary } from "@/lib/composer";
import { generateCopy } from "@/lib/claude";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { fetchOrCacheWalkingRoute } from "@/lib/walking-routes";
import { calculateTotalSpend } from "@/config/budgets";
import {
  resolveTimeWindow,
  dateToDayColumn,
  isComposeStartTime,
} from "@/lib/itinerary/time-blocks";
import { enrichWithAvailability } from "@/lib/itinerary/availability-enrichment";
import { computeRequestSeed, createSeededRandom } from "@/lib/itinerary/seed";
import { applyPreFilters, buildPreFilterArgs } from "@/lib/itinerary/pre-filter";
import {
  respondComposeFailure,
  respondComposeErrored,
} from "@/lib/itinerary/compose-failure-server";
import type {
  GenerateRequestBody,
  QuestionnaireAnswers,
  ItineraryResponse,
  WalkSegment,
  WalkingMeta,
  WeatherInfo,
} from "@/types";

// Tuning constants live in src/config/algorithm.ts — adjust there, not here.
import { ALGORITHM } from "@/config/algorithm";

function computeWalkingMeta(
  walks: WalkSegment[],
  weather: WeatherInfo | null
): WalkingMeta {
  const cap = weather?.is_bad_weather
    ? ALGORITHM.distance.walkSoftCapMinBadWeather
    : ALGORITHM.distance.walkSoftCapMin;
  if (walks.length === 0) {
    return { longest_walk_min: 0, total_walk_min: 0, any_over_cap: false, cap_min: cap };
  }
  const minutes = walks.map((w) => w.walk_minutes);
  return {
    longest_walk_min: Math.max(...minutes),
    total_walk_min: minutes.reduce((s, m) => s + m, 0),
    any_over_cap: minutes.some((m) => m > cap),
    cap_min: cap,
  };
}

interface AuthedPrefs {
  userId: string;
  name: string | null;
  drinks: string | null;
}

/**
 * Resolve the authed user's profile for personalization + hard filters.
 * Returns `null` gracefully when there's no session — callers fall back
 * to defaults rather than 401ing, since the generation math works
 * without a profile and the UI has its own session gate.
 */
async function readAuthedPrefs(): Promise<AuthedPrefs | null> {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("composer_users")
      .select("name, drinks")
      .eq("id", user.id)
      .maybeSingle();

    return {
      userId: user.id,
      name: (profile?.name as string | null) ?? null,
      drinks: (profile?.drinks as string | null) ?? null,
    };
  } catch (err) {
    console.error("[generate] readAuthedPrefs failed:", err);
    return null;
  }
}

export async function POST(request: Request) {
  // Analytics context — distinct_id / session_id come from the client's
  // PostHog. Captured before the try so the catch can still attribute
  // itinerary_generation_failed to the right person.
  const distinctId = request.headers.get("x-ph-distinct-id");
  const sessionId = request.headers.get("x-ph-session-id");
  const generationStartMs = performance.now();
  let analyticsInputs: Partial<GenerateRequestBody> = {};
  let analyticsUserId: string | null = null;

  try {
    const rawBody = (await request.json()) as Record<string, unknown>;

    // Reject the legacy Phase 0 shape loudly. Any caller still sending
    // `timeBlock` needs to update to `startTime` — silent coercion
    // would mask forgotten call sites and ship the wrong time window.
    if ("timeBlock" in rawBody && !("startTime" in rawBody)) {
      return NextResponse.json(
        {
          error:
            "Request shape is out of date: send `startTime` (e.g. \"19:00\") instead of `timeBlock`.",
        },
        { status: 400 }
      );
    }
    if (!isComposeStartTime(rawBody.startTime)) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid `startTime`. Must be one of 17:00, 18:00, 19:00, 20:00, 21:00.",
        },
        { status: 400 }
      );
    }

    const body = rawBody as unknown as GenerateRequestBody;
    analyticsInputs = body;

    const excludeVenueIds = Array.isArray(body.excludeVenueIds)
      ? body.excludeVenueIds.filter((id): id is string => typeof id === "string")
      : [];

    // Resolve startTime → 5-hour window (wrapping past midnight).
    // Downstream scoring and composition reason in minutes, so we
    // normalize at the edge and pass a full QuestionnaireAnswers
    // through the rest of the pipeline. Response.inputs echoes the
    // resolved shape so the UI can render real times.
    const window = resolveTimeWindow(body.startTime);
    const inputs: QuestionnaireAnswers = { ...body, endTime: window.endTime };

    // fetchActiveVenues paginates through the catalog and cross-checks
    // against an exact count. .catch handles the throw path so we can
    // keep the user-facing 500 message that the bare-select error
    // branch produced.
    const [prefs, weather, venuesAll] = await Promise.all([
      readAuthedPrefs(),
      fetchWeather(),
      fetchActiveVenues().catch((err) => {
        console.error("[generate] fetchActiveVenues failed:", err);
        return null;
      }),
    ]);
    analyticsUserId = prefs?.userId ?? null;

    if (venuesAll === null) {
      return NextResponse.json(
        { error: "Failed to fetch venues" },
        { status: 500 }
      );
    }

    // Strict canonical pre-filter stack — same shape across /api/generate,
    // /api/swap-stop, /api/add-stop. Every stage enforces a user input;
    // nothing widens, drops, or relaxes. A zeroed pool returns a typed
    // ComposeFailure naming the stage so the UI can surface an
    // actionable next move instead of a generic "no results."
    const pre = applyPreFilters(
      buildPreFilterArgs({
        venues: venuesAll,
        inputs: {
          budget: body.budget,
          day: inputs.day,
          startTime: inputs.startTime,
          endTime: inputs.endTime,
          neighborhoods: inputs.neighborhoods ?? [],
        },
        exclude: new Set(excludeVenueIds),
        drinks: prefs?.drinks ?? null,
      }),
    );
    if (!pre.ok) {
      return respondComposeFailure(
        pre.zeroingStage,
        "generate",
        inputs,
        { userId: analyticsUserId, distinctId, sessionId },
      );
    }
    const venues = pre.venues;
    const dayColumn = dateToDayColumn(inputs.day);

    // Start "compose" timing here — all in-process CPU work below this
    // line is what we mean by "the algorithm" (filtering already happened
    // above; that's part of the pre-data setup we group with auth/weather).
    // Compose ends after buildGoogleMapsUrl returns, before any external
    // API calls (Gemini, Mapbox, Resy).
    const composeStartMs = performance.now();

    // Seed jitter from request hash for deterministic itineraries.
    const seed = computeRequestSeed(body);
    const random = createSeededRandom(seed);
    console.info(`[generate] seed=${seed} for ${body.occasion}/${body.vibe}/${body.budget}`);

    // Plan the stop mix from the time window, then score + assemble stops
    const composed = composeItinerary(venues, inputs, weather, undefined, random, dayColumn, window);

    if (composed.stops.length === 0) {
      // The pre-filter cleared every user-input stage. Composer
      // returns `zeroingStage` explaining which downstream gate
      // emptied the pool — "fit" when no Main/stop-1 combination
      // projects within the user's window; "proximity" when stop 1
      // can't reach Main within the walking cap; defaults to
      // "proximity" if composer didn't tag it.
      const stage = composed.zeroingStage ?? "proximity";
      return respondComposeFailure(stage, "generate", inputs, {
        userId: analyticsUserId,
        distinctId,
        sessionId,
      });
    }

    const allWalks: WalkSegment[] = [];
    for (let i = 0; i < composed.stops.length - 1; i++) {
      const from = composed.stops[i].venue;
      const to = composed.stops[i + 1].venue;
      allWalks.push({
        from: from.name,
        to: to.name,
        distance_km: walkDistanceKm(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude
        ),
        walk_minutes: walkTimeMinutes(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude
        ),
      });
    }

    // 2026-06-11: applyEndTimeBuffer was deleted. It was the other
    // silent shape-change path — when the composed timeline overflowed
    // endTime by < lastStartBufferMin, it dropped the trailing stop
    // and set truncated_for_end_time=true (a flag no UI ever read).
    // Strict-filters principle: don't second-guess the composer. If a
    // future timeline-validation step is needed, fail honestly via
    // ComposeFailure instead of silently truncating.
    const stops = composed.stops;
    const walks = allWalks;
    const maps_url = buildGoogleMapsUrl(stops.map((s) => s.venue));

    // Compose done; enrich starts here. Enrichment is dominated by external
    // API latency (Gemini + Mapbox + Resy) — tracking it separately surfaces
    // those bottlenecks without contaminating the algorithm signal.
    const time_to_compose_ms = Math.round(performance.now() - composeStartMs);
    const enrichStartMs = performance.now();

    // Phase 10: fetch real walking routes per segment in parallel with
    // Gemini copy generation. fetchOrCacheWalkingRoute hits the
    // composer_walking_routes cache first; misses go to Mapbox Directions
    // and persist. Failures resolve to null geometry — the UI then
    // falls back to a straight-line render.
    const [copy, walkRoutes] = await Promise.all([
      generateCopy(stops, inputs, weather, prefs?.name ?? undefined),
      Promise.all(
        walks.map((w, i) => {
          const from = stops[i].venue;
          const to = stops[i + 1].venue;
          // Pass straight-line minutes as the fallback so Mapbox
          // outages don't blank the walk-time label.
          return fetchOrCacheWalkingRoute(
            from.id,
            to.id,
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
            w.walk_minutes,
            Math.round(w.distance_km * 1000),
          );
        })
      ),
    ]);

    for (let i = 0; i < walks.length; i++) {
      const r = walkRoutes[i];
      walks[i].route_geometry = r.routeGeometry ?? undefined;
      // Prefer Mapbox-derived minutes/distance when geometry is real.
      if (r.routeGeometry) {
        walks[i].walk_minutes = r.walkMinutes;
        walks[i].distance_km = r.walkDistanceMeters / 1000;
      }
    }

    for (const stop of stops) {
      const aiNote = copy.venue_notes[stop.venue.name];
      if (aiNote) stop.curation_note = aiNote;
    }

    const totalRange = calculateTotalSpend(stops.map((s) => s.venue.price_tier ?? 2));
    const walking = computeWalkingMeta(walks, weather);

    const response: ItineraryResponse = {
      header: {
        title: copy.title,
        subtitle: copy.subtitle,
        occasion_tag: inputs.occasion,
        vibe_tag: inputs.vibe,
        estimated_total: totalRange,
        weather,
      },
      stops,
      walks,
      walking,
      maps_url,
      inputs,
    };

    // Enrich stops with live Resy availability, filtered to the
    // user's time block. candidatePool = undefined for now — swap will
    // skip and mark no_slots_in_block. Phase 3a-3 can pass the broader
    // pool if we refactor composeItinerary to expose it.
    const enriched = await enrichWithAvailability(
      response,
      inputs.day,
      2, // default party size — Phase 3a-3 will thread this from the client
      window,
      undefined
    );
    const time_to_enrich_ms = Math.round(performance.now() - enrichStartMs);

    // Track itinerary composition server-side for reliable funnel
    // analytics. Fire-and-forget; the wrapper handles its own failures.
    // Renamed 2026-06-11 (audit): itinerary_generated → itinerary_composed.
    // Aligns with "compose" as the canonical verb across the funnel
    // (compose_started, compose_step_completed, compose_failed) and with
    // the product name itself.
    const requestedStopCount = ALGORITHM.composition.stopDefaultCount;
    const actualStopCount = enriched.stops.length;
    void trackServer(
      EVENTS.ITINERARY_COMPOSED,
      { userId: analyticsUserId, distinctId, sessionId },
      {
        ...buildComposeContext(inputs),
        itinerary_id: null,
        requested_stop_count: requestedStopCount,
        stop_count: actualStopCount,
        venue_ids: enriched.stops.map((s) => s.venue.id),
        venue_names: enriched.stops.map((s) => s.venue.name),
        categories: enriched.stops.map((s) => s.venue.category ?? null),
        neighborhoods_used: enriched.stops.map((s) => s.venue.neighborhood),
        total_walk_min: enriched.walking?.total_walk_min ?? 0,
        longest_walk_min: enriched.walking?.longest_walk_min ?? 0,
        time_total_ms: Math.round(performance.now() - generationStartMs),
        time_to_compose_ms,
        time_to_enrich_ms,
      }
    );

    // 2026-06-11: itinerary_fallback_single_stop removed. The
    // single-stop fallback in composer.ts that this event tracked was
    // deleted; the same condition now fires compose_failed with
    // zeroing_stage="proximity" earlier in this handler.

    return NextResponse.json(enriched);
  } catch (error) {
    // *_errored vs *_failed convention: this catch path is the 500-class
    // "system broke" bucket — distinct from the 422 compose_failed
    // emissions above (which are expected-user-shape failures). The
    // helper classifies error.name into a snake_case bucket; the raw
    // error.message is intentionally NOT shipped (PII risk).
    console.error("Generation error:", error);
    return respondComposeErrored(
      error,
      "generate",
      analyticsInputs,
      { userId: analyticsUserId, distinctId, sessionId },
      Math.round(performance.now() - generationStartMs),
    );
  }
}
