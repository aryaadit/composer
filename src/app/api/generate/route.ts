import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getServerSupabase } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/weather";
import { composeItinerary, ROLE_AVG_DURATION_MIN } from "@/lib/composer";
import { generateCopy } from "@/lib/claude";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import { calculateTotalSpend } from "@/config/budgets";
import { ALCOHOL_VIBE_TAGS } from "@/config/vibes";
import {
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
 * duration_minutes (or the role average as fallback). Drops any trailing
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
    const dur = stop.venue.duration_minutes ?? ROLE_AVG_DURATION_MIN[stop.role];
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
    const inputs = (await request.json()) as QuestionnaireAnswers;

    const [prefs, weather, venueResult] = await Promise.all([
      readAuthedPrefs(),
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

    // Plan the stop mix from the time window, then score + assemble stops
    const composed = composeItinerary(venues, inputs, weather);

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

    const copy = await generateCopy(stops, inputs, weather, prefs?.name ?? undefined);

    for (const stop of stops) {
      const aiNote = copy.venue_notes[stop.venue.name];
      if (aiNote) stop.curation_note = aiNote;
    }

    const totalRange = calculateTotalSpend(stops.map((s) => s.venue.price_tier));
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

    return NextResponse.json(response);
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate itinerary" },
      { status: 500 }
    );
  }
}
