import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/weather";
import { composeItinerary, ROLE_AVG_DURATION_MIN } from "@/lib/composer";
import { generateCopy } from "@/lib/claude";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { buildWalkMapUrl } from "@/lib/mapbox";
import { calculateTotalSpend, BUDGET_TIER_MAP, widenBudgetTiers } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import {
  resolveTimeWindow,
  dateToDayColumn,
  venueOpenForBlock,
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
      name: (profile?.name as string | null) ?? null,
      drinks: (profile?.drinks as string | null) ?? null,
    };
  } catch (err) {
    console.error("[generate] readAuthedPrefs failed:", err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequestBody;

    const excludeVenueIds = Array.isArray(body.excludeVenueIds)
      ? body.excludeVenueIds.filter((id): id is string => typeof id === "string")
      : [];

    // Resolve timeBlock → concrete startTime/endTime. Downstream scoring
    // and composition reason in minutes, so we normalize at the edge
    // and pass a full QuestionnaireAnswers through the rest of the
    // pipeline. Response.inputs echoes the resolved shape so the UI
    // can render real times.
    const { startTime, endTime } = resolveTimeWindow(body.timeBlock);
    const inputs: QuestionnaireAnswers = { ...body, startTime, endTime };

    const [prefs, weather, venueResult] = await Promise.all([
      readAuthedPrefs(),
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

    if (excludeVenueIds.length > 0) {
      const excludeSet = new Set(excludeVenueIds);
      const filtered = venues.filter((v) => !excludeSet.has(v.id));
      if (filtered.length >= ALGORITHM.pools.minPoolSize) {
        venues = filtered;
      } else {
        console.warn(
          `[generate] exclusion would collapse pool to ${filtered.length} venues (min ${ALGORITHM.pools.minPoolSize}), falling back to unfiltered pool`
        );
      }
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

    // Time block filter — only venues open during the selected block on
    // the selected day. Per-day blocks override global time_blocks.
    const dayColumn = dateToDayColumn(inputs.day);
    const preBlockCount = venues.length;
    venues = venues.filter((v) =>
      venueOpenForBlock(v, dayColumn, body.timeBlock)
    );
    if (venues.length < 30) {
      console.warn(
        `[generate] time block filter: ${preBlockCount} → ${venues.length} venues (${body.timeBlock} on ${dayColumn})`
      );
    }

    // Filter out permanently/temporarily closed venues
    venues = venues.filter(
      (v) =>
        v.business_status !== "CLOSED_PERMANENTLY" &&
        v.business_status !== "CLOSED_TEMPORARILY"
    );

    // Budget hard filter — keep venues in the user's price tier, widen by
    // one tier if the pool drops below the threshold.
    if (body.budget !== "no_preference") {
      const allowedTiers = BUDGET_TIER_MAP[body.budget] ?? [1, 2, 3, 4];
      let budgetFiltered = venues.filter(
        (v) => v.price_tier != null && allowedTiers.includes(v.price_tier)
      );
      if (budgetFiltered.length < ALGORITHM.pools.minBudgetWideningThreshold) {
        const widened = widenBudgetTiers(allowedTiers);
        budgetFiltered = venues.filter(
          (v) => v.price_tier != null && widened.includes(v.price_tier)
        );
        console.info(
          `[generate] budget pool thin (${budgetFiltered.length} after widening from [${allowedTiers}] to [${widened}])`
        );
      }
      venues = budgetFiltered;
    }

    // Seed jitter from request hash for deterministic itineraries.
    const seed = computeRequestSeed(body);
    const random = createSeededRandom(seed);
    console.info(`[generate] seed=${seed} for ${body.occasion}/${body.vibe}/${body.budget}`);

    // Plan the stop mix from the time window, then score + assemble stops
    const composed = composeItinerary(venues, inputs, weather, undefined, random);

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
      body.timeBlock,
      undefined
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate itinerary" },
      { status: 500 }
    );
  }
}
