import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchWeather } from "@/lib/weather";
import { selectTrio } from "@/lib/scoring";
import { generateCopy } from "@/lib/claude";
import { walkTimeMinutes, walkDistanceKm, buildGoogleMapsUrl } from "@/lib/geo";
import {
  QuestionnaireAnswers,
  Venue,
  ItineraryResponse,
  WalkSegment,
} from "@/types";

export async function POST(request: Request) {
  try {
    const inputs: QuestionnaireAnswers = await request.json();

    const supabase = getSupabase();

    // Parallel: fetch weather + query venues
    const [weather, venueResult] = await Promise.all([
      fetchWeather(),
      supabase.from("venues").select("*").eq("active", true),
    ]);

    if (venueResult.error) {
      return NextResponse.json(
        { error: "Failed to fetch venues" },
        { status: 500 }
      );
    }

    const venues = venueResult.data as Venue[];

    if (venues.length === 0) {
      return NextResponse.json(
        { error: "No venues available" },
        { status: 404 }
      );
    }

    // Score and select trio
    const { stops } = selectTrio(venues, inputs, weather);

    if (stops.length < 3) {
      // If we can't fill all 3 stops, try with relaxed filters
      // Already handled in selectTrio via progressive relaxation
    }

    // Calculate walk segments
    const walks: WalkSegment[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i].venue;
      const to = stops[i + 1].venue;
      walks.push({
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

    // Build Google Maps URL
    const maps_url = buildGoogleMapsUrl(
      stops.map((s) => s.venue)
    );

    // Generate Claude copy
    const copy = await generateCopy(stops, inputs, weather);

    // Apply Claude-generated curation notes
    for (const stop of stops) {
      const claudeNote = copy.venue_notes[stop.venue.name];
      if (claudeNote) {
        stop.curation_note = claudeNote;
      }
    }

    // Calculate estimated total spend
    const totalRange = calculateTotalSpend(stops.map((s) => s.venue.price_tier));

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

function calculateTotalSpend(tiers: number[]): string {
  const ranges: Record<number, [number, number]> = {
    1: [15, 30],
    2: [35, 65],
    3: [75, 150],
  };

  let low = 0;
  let high = 0;
  for (const tier of tiers) {
    const [lo, hi] = ranges[tier] ?? [30, 60];
    low += lo;
    high += hi;
  }

  return `$${low}–${high}`;
}
