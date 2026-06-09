import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { trackServer } from "@/lib/analytics-server";
import { fetchWeather } from "@/lib/weather";
import { composeItinerary, ROLE_AVG_DURATION_MIN } from "@/lib/composer";
import { generateCopy } from "@/lib/claude";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { buildWalkMapUrl } from "@/lib/mapbox";
import { calculateTotalSpend, BUDGET_TIER_MAP } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import {
  resolveTimeWindow,
  dateToDayColumn,
  venueOpenForWindow,
  isComposeStartTime,
} from "@/lib/itinerary/time-blocks";
import { enrichWithAvailability } from "@/lib/itinerary/availability-enrichment";
import { computeRequestSeed, createSeededRandom } from "@/lib/itinerary/seed";
import type {
  GenerateRequestBody,
  QuestionnaireAnswers,
  Venue,
  ItineraryResponse,
  ItineraryStop,
  WalkSegment,
  WalkingMeta,
  WeatherInfo,
} from "@/types";

// Tuning constants live in src/config/algorithm.ts — adjust there, not here.
import { ALGORITHM } from "@/config/algorithm";

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Walk the composed stops computing actual arrival times from per-venue
 * duration_hours (converted to minutes, or role-average fallback). Drops any trailing
 * stop whose arrival lands within ALGORITHM.composition.lastStartBufferMin of endTime — so a
 * 7-10pm plan can't push a bar to 9:55.
 */
function applyEndTimeBuffer(
  stops: ItineraryStop[],
  walks: WalkSegment[],
  startTime: string,
  endTime: string
): { stops: ItineraryStop[]; walks: WalkSegment[]; truncated: boolean } {
  if (stops.length === 0) return { stops, walks, truncated: false };

  const startMin = parseHHMM(startTime);
  let endMin = parseHHMM(endTime);
  if (endMin <= startMin) endMin += 24 * 60; // wrap past midnight
  const lastStartMin = endMin - ALGORITHM.composition.lastStartBufferMin;

  const kept: ItineraryStop[] = [];
  let currentMin = startMin;
  let truncated = false;

  for (let i = 0; i < stops.length; i++) {
    if (i > 0) {
      currentMin += walks[i - 1]?.walk_minutes ?? 0;
    }
    // Never drop the first stop — it's the anchor of the night.
    if (i > 0 && currentMin > lastStartMin) {
      truncated = true;
      break;
    }
    kept.push(stops[i]);
    const stop = stops[i];
    // duration_hours stores 1/2/3; convert to minutes for the buffer
    // check. Falls back to the role average when the venue has no value.
    const dur = stop.venue.duration_hours
      ? stop.venue.duration_hours * 60
      : ROLE_AVG_DURATION_MIN[stop.role];
    currentMin += dur;
  }

  const keptWalks = walks.slice(0, Math.max(0, kept.length - 1));
  return { stops: kept, walks: keptWalks, truncated };
}

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

    const [prefs, weather, venueResult] = await Promise.all([
      readAuthedPrefs(),
      fetchWeather(),
      getSupabase().from("composer_venues_v2").select("*").eq("active", true),
    ]);
    analyticsUserId = prefs?.userId ?? null;

    if (venueResult.error) {
      return NextResponse.json(
        { error: "Failed to fetch venues" },
        { status: 500 }
      );
    }

    let venues = venueResult.data as Venue[];

    // Graceful exclude-list degradation. The list is ordered
    // most-recent-first by the client. Drop entries from the END
    // (oldest) until the pool clears minPoolSize.
    if (excludeVenueIds.length > 0) {
      const ids = [...excludeVenueIds];
      let toExclude = new Set(ids);
      let filtered = venues.filter((v) => !toExclude.has(v.id));
      const trimmed: string[] = [];
      while (
        filtered.length < ALGORITHM.pools.minPoolSize &&
        ids.length > 0
      ) {
        const dropped = ids.pop();
        if (!dropped) break;
        trimmed.push(dropped);
        toExclude = new Set(ids);
        filtered = venues.filter((v) => !toExclude.has(v.id));
      }
      if (trimmed.length > 0) {
        console.info(
          `[generate] partial exclusion: dropped ${trimmed.length} oldest IDs to keep pool ≥ ${ALGORITHM.pools.minPoolSize}`
        );
      }
      venues = filtered;
    }

    if (venues.length === 0) {
      return NextResponse.json(
        { error: "No venues available" },
        { status: 404 }
      );
    }

    // Drinks filter — if the signed-in user said no to drinks in their
    // profile, drop alcohol-forward venues entirely.
    if (prefs?.drinks === "no") {
      venues = venues.filter(
        (v) => !v.vibe_tags.some((t) => ALCOHOL_VIBE_TAGS.has(t))
      );
    }

    // Time window filter — only venues whose effective open hours
    // overlap the user's window on the selected day. Per-day blocks
    // override global time_blocks (hybrid rule). Replaces the prior
    // single-block filter; venues open in evening AND/OR late_night
    // both qualify for late-start windows that wrap past 22:00.
    const dayColumn = dateToDayColumn(inputs.day);
    const preBlockCount = venues.length;
    venues = venues.filter((v) =>
      venueOpenForWindow(v, dayColumn, window)
    );
    if (venues.length < 30) {
      console.warn(
        `[generate] time window filter: ${preBlockCount} → ${venues.length} venues (${window.startTime}-${window.endTime} on ${dayColumn})`
      );
    }

    // Filter out permanently/temporarily closed venues
    venues = venues.filter(
      (v) =>
        v.business_status !== "CLOSED_PERMANENTLY" &&
        v.business_status !== "CLOSED_TEMPORARILY"
    );

    // Budget hard filter — keep venues whose tier is in the bucket's
    // allowed set (downward-permissive: nice_out admits tier-1 too). If
    // the pool drops below the threshold AND we can still widen up, add
    // one tier above the bucket's max. Downward widening is no longer
    // needed because BUDGET_TIER_MAP already includes the cheaper tier.
    // Null price_tier defaults to tier 2 ("nice_out") — same as scoring.
    // Phase 1 dropped the `no_preference` budget; every ComposeBudget
    // value maps to a concrete tier set so the filter always runs.
    {
      const allowedTiers = BUDGET_TIER_MAP[body.budget] ?? [1, 2, 3, 4];
      let budgetFiltered = venues.filter(
        (v) => allowedTiers.includes(v.price_tier ?? 2)
      );
      const maxTier = Math.max(...allowedTiers);
      if (
        budgetFiltered.length < ALGORITHM.pools.minBudgetWideningThreshold &&
        maxTier < 4
      ) {
        const widened = [...allowedTiers, maxTier + 1];
        budgetFiltered = venues.filter(
          (v) => widened.includes(v.price_tier ?? 2)
        );
        console.info(
          `[generate] budget pool thin (${budgetFiltered.length} after upward widening from [${allowedTiers}] to [${widened}])`
        );
      }
      venues = budgetFiltered;
    }

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
      return NextResponse.json(
        { error: "No matching venues found" },
        { status: 404 }
      );
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

    const { stops, walks, truncated } = applyEndTimeBuffer(
      composed.stops,
      allWalks,
      inputs.startTime,
      inputs.endTime
    );

    const maps_url = buildGoogleMapsUrl(stops.map((s) => s.venue));

    // Compose done; enrich starts here. Enrichment is dominated by external
    // API latency (Gemini + Mapbox + Resy) — tracking it separately surfaces
    // those bottlenecks without contaminating the algorithm signal.
    const time_to_compose_ms = Math.round(performance.now() - composeStartMs);
    const enrichStartMs = performance.now();

    // Enrich each walk with a Mapbox static image URL in parallel with copy
    // generation. Failures resolve to null and render text-only in the UI.
    const [copy, mapUrls] = await Promise.all([
      generateCopy(stops, inputs, weather, prefs?.name ?? undefined),
      Promise.all(
        walks.map((_, i) => {
          const from = stops[i].venue;
          const to = stops[i + 1].venue;
          return buildWalkMapUrl(
            from.latitude,
            from.longitude,
            to.latitude,
            to.longitude
          );
        })
      ),
    ]);

    for (let i = 0; i < walks.length; i++) {
      walks[i].map_url = mapUrls[i];
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
      truncated_for_end_time: truncated,
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

    // Track itinerary generation server-side for reliable funnel analytics.
    // Fire-and-forget; the wrapper handles its own failures.
    void trackServer(
      "itinerary_generated",
      { userId: analyticsUserId, distinctId, sessionId },
      {
        occasion: inputs.occasion,
        vibe: inputs.vibe,
        budget: inputs.budget,
        start_time: inputs.startTime,
        end_time: inputs.endTime,
        day: inputs.day,
        neighborhoods: inputs.neighborhoods ?? [],
        stop_count: enriched.stops.length,
        venue_ids: enriched.stops.map((s) => s.venue.id),
        venue_names: enriched.stops.map((s) => s.venue.name),
        categories: enriched.stops.map((s) => s.venue.category ?? null),
        neighborhoods_used: enriched.stops.map((s) => s.venue.neighborhood),
        total_walk_min: enriched.walking?.total_walk_min ?? 0,
        longest_walk_min: enriched.walking?.longest_walk_min ?? 0,
        truncated_for_end_time: enriched.truncated_for_end_time ?? false,
        time_total_ms: Math.round(performance.now() - generationStartMs),
        time_to_compose_ms,
        time_to_enrich_ms,
      }
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Generation error:", error);

    // Classify the error for the funnel. The catch swallows the
    // underlying stack but the surface message is fine to ship — it
    // never contains PII.
    const message = error instanceof Error ? error.message : "Unknown error";
    const reason: "no_venues_match" | "api_error" | "timeout" | "unknown" =
      message.toLowerCase().includes("timeout")
        ? "timeout"
        : message.toLowerCase().includes("venue")
        ? "no_venues_match"
        : message.toLowerCase().includes("fetch") || message.toLowerCase().includes("api")
        ? "api_error"
        : "unknown";

    void trackServer(
      "itinerary_generation_failed",
      { userId: analyticsUserId, distinctId, sessionId },
      {
        occasion: analyticsInputs.occasion ?? null,
        vibe: analyticsInputs.vibe ?? null,
        budget: analyticsInputs.budget ?? null,
        start_time: analyticsInputs.startTime ?? null,
        day: analyticsInputs.day ?? null,
        neighborhoods: analyticsInputs.neighborhoods ?? [],
        reason,
        error_message: message.slice(0, 200),
        time_to_fail_ms: Math.round(performance.now() - generationStartMs),
      }
    );

    return NextResponse.json(
      { error: "Failed to generate itinerary" },
      { status: 500 }
    );
  }
}
