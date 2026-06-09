"use client";

// Read-only view of a saved itinerary. Saved rows don't store walk segments
// or maps_url (they're derivable), so we rebuild those client-side from the
// venue coordinates. Regenerate / add-stop are intentionally absent —
// this is a review surface, not a live planner. To remake the plan, the user
// starts a new compose flow from home.

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { track } from "@/lib/analytics";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { PastItineraryBanner } from "@/components/itinerary/PastItineraryBanner";
import { ActionBar } from "@/components/itinerary/ActionBar";
import { LooksGoodCTA } from "@/components/itinerary/LooksGoodCTA";
import { ItineraryEngagementProvider } from "@/components/itinerary/EngagementProvider";
import { StepLoading } from "@/components/questionnaire/StepLoading";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
import { isPastDate } from "@/lib/dateUtils";
import { hydrateSavedItinerary } from "@/lib/itinerary/saved-hydration";
import type { ItineraryResponse, SavedItinerary } from "@/types";

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
  // Once-per-mount guard for itinerary_viewed (StrictMode double-invokes
  // effects in dev; without this we'd fire twice on every page load).
  const viewedFiredRef = useRef(false);

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
        setItinerary(hydrateSavedItinerary(data));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Fire itinerary_viewed once the itinerary is loaded.
  useEffect(() => {
    if (!itinerary || viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    track("itinerary_viewed", {
      source: "saved",
      itinerary_id: id,
      is_past: isPastDate(itinerary.inputs.day),
    });
  }, [itinerary, id]);

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

  const isPast = isPastDate(itinerary.inputs.day);
  return (
    <ItineraryEngagementProvider source="saved" itineraryId={id}>
      <main className="flex flex-1 flex-col items-center min-h-screen pb-8">
        <Header
          rightSlot={
            <Link
              href="/"
              className="font-sans text-sm text-muted hover:text-charcoal transition-colors"
            >
              &larr; Back
            </Link>
          }
        />
        <div className="w-full px-6 mt-6 flex flex-col items-center">
          <CompositionHeader header={itinerary.header} inputs={itinerary.inputs} />
          {isPast && <PastItineraryBanner day={itinerary.inputs.day} />}
          {/* Phase 7: same CTA pattern as fresh, but starts in
              "Saved ✓ ▼" — tap opens ConfirmModal directly. Restores
              share + calendar export access for previously-saved plans. */}
          <LooksGoodCTA
            itinerary={itinerary}
            initialSavedId={id}
            surface="saved"
          />
          <ItineraryView
            stops={itinerary.stops}
            walks={itinerary.walks}
            date={itinerary.inputs.day}
            partySize={2}
            startTime={itinerary.inputs.startTime}
            isPast={isPast}
            surface="saved"
          />
        </div>
        <ActionBar itinerary={itinerary} />
      </main>
    </ItineraryEngagementProvider>
  );
}
