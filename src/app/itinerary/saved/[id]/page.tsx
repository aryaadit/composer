"use client";

// Read-only view of a saved itinerary. Saved rows don't store walk segments
// or maps_url (they're derivable), so we rebuild those client-side from the
// venue coordinates. Regenerate / add-stop / save are intentionally absent —
// this is a review surface, not a live planner. To remake the plan, the user
// hits "New date plan" from home.

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { ActionBar } from "@/components/itinerary/ActionBar";
import { StepLoading } from "@/components/questionnaire/StepLoading";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
import {
  walkTimeMinutes,
  walkDistanceKm,
  buildGoogleMapsUrl,
} from "@/lib/geo";
import { calculateTotalSpend } from "@/config/budgets";
import { resolveTimeWindow } from "@/lib/itinerary/time-blocks";
import type {
  TimeBlock,
  ItineraryResponse,
  ItineraryStop,
  SavedItinerary,
  WalkSegment,
} from "@/types";

function rebuildWalks(stops: ItineraryStop[]): WalkSegment[] {
  const walks: WalkSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].venue;
    const b = stops[i + 1].venue;
    walks.push({
      from: a.name,
      to: b.name,
      distance_km: walkDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude),
      walk_minutes: walkTimeMinutes(a.latitude, a.longitude, b.latitude, b.longitude),
    });
  }
  return walks;
}

function toItineraryResponse(saved: SavedItinerary): ItineraryResponse {
  const stops = saved.stops ?? [];
  const walks = rebuildWalks(stops);
  return {
    header: {
      title: saved.custom_name || saved.title || "Saved night",
      subtitle: saved.subtitle ?? "",
      occasion_tag: saved.occasion ?? "",
      vibe_tag: saved.vibe ?? "",
      estimated_total: calculateTotalSpend(stops.map((s) => s.venue.price_tier ?? 2)),
      weather: saved.weather,
    },
    stops,
    walks,
    walking:
      saved.walking ?? {
        longest_walk_min: walks.reduce((m, w) => Math.max(m, w.walk_minutes), 0),
        total_walk_min: walks.reduce((s, w) => s + w.walk_minutes, 0),
        any_over_cap: false,
        cap_min: 15,
      },
    truncated_for_end_time: false,
    maps_url: buildGoogleMapsUrl(stops.map((s) => s.venue)),
    // `inputs` isn't read by CompositionHeader / ItineraryView, but
    // The share view reads `inputs.startTime` for time display, so
    inputs: (() => {
      const timeBlock = (saved.time_block as TimeBlock) ?? "evening";
      const { startTime, endTime } = resolveTimeWindow(timeBlock);
      return {
        occasion: (saved.occasion ?? "") as ItineraryResponse["inputs"]["occasion"],
        neighborhoods: (saved.neighborhoods ?? []) as ItineraryResponse["inputs"]["neighborhoods"],
        budget: (saved.budget ?? "") as ItineraryResponse["inputs"]["budget"],
        vibe: (saved.vibe ?? "") as ItineraryResponse["inputs"]["vibe"],
        day: saved.day ?? "",
        timeBlock,
        startTime,
        endTime,
      };
    })(),
  };
}

export default function SavedItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }: { data: SavedItinerary | null; error: unknown }) => {
        if (cancelled) return;
        if (error || !data) {
          setError("We couldn't find that saved plan.");
          setLoaded(true);
          return;
        }
        setItinerary(toItineraryResponse(data));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!loaded) return <StepLoading />;

  if (error || !itinerary) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          {error ?? "Something went wrong."}
        </p>
        <Button onClick={() => router.push("/")}>Back home</Button>
      </main>
    );
  }

  const noopRegenerate = () => {};
  return (
    <main className="flex flex-1 flex-col items-center min-h-screen px-6 pt-6 pb-8">
      <div className="w-full max-w-lg mx-auto mb-6">
        <Header showBack backHref="/" />
      </div>

      <CompositionHeader header={itinerary.header} inputs={itinerary.inputs} />
      <ItineraryView
        stops={itinerary.stops}
        walks={itinerary.walks}
        timeBlock={itinerary.inputs.timeBlock}
        date={itinerary.inputs.day}
        partySize={2}
      />
      <ActionBar
        itinerary={itinerary}
        onRegenerate={noopRegenerate}
        isRegenerating={false}
        initialSaved
      />
    </main>
  );
}
