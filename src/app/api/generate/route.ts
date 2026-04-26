import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/weather";
import { ROLE_AVG_DURATION_MIN } from "@/lib/composer";
import { generateCopy } from "@/lib/claude";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { buildWalkMapUrl } from "@/lib/mapbox";
import { calculateTotalSpend } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import {
  resolveTimeWindow,
  dateToDayColumn,
  venueOpenForBlock,
} from "@/lib/itinerary/time-blocks";
import { composeWithChainValidation } from "@/lib/itinerary/compose-with-chain";
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

// Don't let a new stop START within this many minutes of the user's endTime.
// Reid's engine uses 30; the idea is "if the user said 10pm, don't kick off
// a bar that would arrive at 9:55." The stop that's already running is
// allowed to finish naturally, even if that lands past endTime.
const LAST_START_BUFFER_MIN = 30;

// Walk-quality caps used only to compute the `any_over_cap` summary flag on
// the response. These are soft thresholds for UX ("this plan has a long
// walk"), distinct from the hard proximity cap enforced in lib/scoring.ts
// during venue selection.
const WALK_SOFT_CAP_MIN = 15;
const WALK_SOFT_CAP_MIN_BAD_WEATHER = 5;

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Walk the composed stops computing actual arrival times from per-venue
 * duration_hours (converted to minutes, or role-average fallback). Drops any trailing
 * stop whose arrival lands within LAST_START_BUFFER_MIN of endTime — so a
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
  const lastStartMin = endMin - LAST_START_BUFFER_MIN;

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
    ? WALK_SOFT_CAP_MIN_BAD_WEATHER
    : WALK_SOFT_CAP_MIN;
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

    const MIN_POOL_SIZE = 4;
    let venues = venueResult.data as Venue[];

    if (excludeVenueIds.length > 0) {
      const excludeSet = new Set(excludeVenueIds);
      const filtered = venues.filter((v) => !excludeSet.has(v.id));
      if (filtered.length >= MIN_POOL_SIZE) {
        venues = filtered;
      } else {
        console.warn(
          `[generate] exclusion would collapse pool to ${filtered.length} venues (min ${MIN_POOL_SIZE}), falling back to unfiltered pool`
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

    // Compose with temporal chain validation. This:
    //   1. Scores candidates per role
    //   2. Batch-fetches Resy availability for top candidates
    //   3. Solves a temporal chain (forward-check + backtrack)
    //   4. Returns pre-validated stops with availability attached
    const composed = await composeWithChainValidation(
      venues,
      inputs,
      weather,
      body.timeBlock,
      inputs.day,
      2,
    );

    if (composed.stops.length === 0) {
      return NextResponse.json(
        { error: "No matching venues found" },
        { status: 404 }
      );
    }

    const stops = composed.stops;

    // Compute walks between chain-validated stops.
    const allWalks: WalkSegment[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i].venue;
      const to = stops[i + 1].venue;
      allWalks.push({
        from: from.name,
        to: to.name,
        distance_km: walkDistanceKm(
          from.latitude, from.longitude,
          to.latitude, to.longitude
        ),
        walk_minutes: walkTimeMinutes(
          from.latitude, from.longitude,
          to.latitude, to.longitude
        ),
      });
    }

    const { stops: finalStops, walks, truncated } = applyEndTimeBuffer(
      stops,
      allWalks,
      inputs.startTime,
      inputs.endTime
    );

    const maps_url = buildGoogleMapsUrl(finalStops.map((s) => s.venue));

    const [copy, mapUrls] = await Promise.all([
      generateCopy(finalStops, inputs, weather, prefs?.name ?? undefined),
      Promise.all(
        walks.map((_, i) => {
          const from = finalStops[i].venue;
          const to = finalStops[i + 1].venue;
          return buildWalkMapUrl(
            from.latitude, from.longitude,
            to.latitude, to.longitude
          );
        })
      ),
    ]);

    for (let i = 0; i < walks.length; i++) {
      walks[i].map_url = mapUrls[i];
    }

    for (const stop of finalStops) {
      const aiNote = copy.venue_notes[stop.venue.name];
      if (aiNote) stop.curation_note = aiNote;
    }

    const totalRange = calculateTotalSpend(finalStops.map((s) => s.venue.price_tier ?? 2));
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
      stops: finalStops,
      walks,
      walking,
      truncated_for_end_time: truncated,
      maps_url,
      inputs,
      ...(composed.isPartial
        ? { chain_partial: true, chain_message: composed.partialMessage }
        : {}),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate itinerary" },
      { status: 500 }
    );
  }
}
