"use client";

// Saved itinerary detail page. Loads a row from
// `composer_saved_itineraries` by id (RLS gates to the signed-in
// user's own rows) and rehydrates it into a full ItineraryResponse so
// the same CompositionHeader / ItineraryView / ActionBar that render
// a freshly-generated plan can render a saved one.
//
// Two pieces of the response are NOT stored and get recomputed at
// load time from the saved stops + duration:
//   - walks   (per-segment walk distances/times)
//   - maps_url
//   - header.estimated_total
//   - inputs.startTime / inputs.endTime (resolved from duration)

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  walkDistanceKm,
  walkTimeMinutes,
  buildGoogleMapsUrl,
} from "@/lib/geo";
import { calculateTotalSpend } from "@/config/budgets";
import { resolveTimeWindow } from "@/config/durations";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/providers/AuthProvider";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { ActionBar } from "@/components/itinerary/ActionBar";
import { Button } from "@/components/ui/Button";
import type {
  ItineraryResponse,
  QuestionnaireAnswers,
  SavedItinerary,
  WalkSegment,
  Duration,
} from "@/types";

function hydrate(saved: SavedItinerary): ItineraryResponse {
  const stops = saved.stops ?? [];

  // Recompute walks between consecutive stops from venue coordinates.
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

  const maps_url = buildGoogleMapsUrl(stops.map((s) => s.venue));
  const estimated_total = calculateTotalSpend(
    stops.map((s) => s.venue.price_tier)
  );

  // Resolve the saved duration back to concrete start/end times so
  // downstream UI (TextMessageShare) can format them. Fallback to the
  // default preset if the row predates the duration column.
  const duration = (saved.duration as Duration) ?? "3.5h";
  const { startTime, endTime } = resolveTimeWindow(duration);

  const inputs: QuestionnaireAnswers = {
    occasion: (saved.occasion ?? "first-date") as QuestionnaireAnswers["occasion"],
    neighborhoods:
      (saved.neighborhoods ?? []) as QuestionnaireAnswers["neighborhoods"],
    budget: (saved.budget ?? "no-preference") as QuestionnaireAnswers["budget"],
    vibe: (saved.vibe ?? "mix-it-up") as QuestionnaireAnswers["vibe"],
    day: saved.day ?? new Date().toISOString().split("T")[0],
    duration,
    startTime,
    endTime,
  };

  return {
    header: {
      title: saved.title ?? "Saved night",
      subtitle: saved.subtitle ?? "",
      occasion_tag: inputs.occasion,
      vibe_tag: inputs.vibe,
      estimated_total,
      weather: saved.weather,
    },
    stops,
    walks,
    walking: saved.walking ?? {
      longest_walk_min: 0,
      total_walk_min: 0,
      any_over_cap: false,
      cap_min: 15,
    },
    truncated_for_end_time: false,
    maps_url,
    inputs,
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "found"; itinerary: ItineraryResponse }
  | { status: "not-found" }
  | { status: "error"; message: string };

export default function SavedItineraryPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { user, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  // Bounce to root if there's no session — RLS would block the fetch
  // anyway, but the explicit redirect avoids a misleading "not-found".
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace("/");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !id) return;
    let cancelled = false;
    getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[itinerary/id] fetch failed:", error.message);
          setState({ status: "error", message: error.message });
          return;
        }
        if (!data) {
          setState({ status: "not-found" });
          return;
        }
        setState({
          status: "found",
          itinerary: hydrate(data as SavedItinerary),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  // Regenerate isn't meaningful for a saved snapshot — clicking it
  // would conflate "view this saved plan" with "make a new plan".
  // Disable by passing a no-op + true.
  const noopRegenerate = () => {};

  if (state.status === "loading" || authLoading) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          We couldn&apos;t find that saved plan.
        </p>
        <Button href="/">Back home</Button>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          Couldn&apos;t load that plan. Try again in a moment.
        </p>
        <Button href="/">Back home</Button>
      </main>
    );
  }

  const { itinerary } = state;

  return (
    <main className="flex flex-1 flex-col items-center min-h-screen px-6 pt-12 pb-8">
      <Link
        href="/"
        className="self-start font-sans text-xs tracking-wide uppercase text-muted hover:text-charcoal transition-colors mb-6"
      >
        &larr; Back
      </Link>
      <CompositionHeader header={itinerary.header} />
      <ItineraryView stops={itinerary.stops} walks={itinerary.walks} />
      <ActionBar
        itinerary={itinerary}
        onRegenerate={noopRegenerate}
        isRegenerating={false}
        initialSaved
      />
    </main>
  );
}
