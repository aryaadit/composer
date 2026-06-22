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
import { EVENTS, track } from "@/lib/analytics";
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
import { isLuckyItinerary } from "@/lib/itinerary/is-lucky";
import { LuckyCrown } from "@/components/itinerary/LuckyCrown";
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
  // Saved row's created_at — drives the is_revisit / days_since_saved
  // properties on itinerary_viewed. Null until the row resolves.
  const [savedCreatedAt, setSavedCreatedAt] = useState<string | null>(null);
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
        setSavedCreatedAt(data.created_at ?? null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Fire itinerary_viewed once the itinerary is loaded. is_revisit and
  // days_since_saved (saved-surface only — audit) discriminate the
  // immediate post-save view (is_revisit=false, days_since_saved=0)
  // from genuine revisits days later. The save event already fires
  // on the fresh surface; itinerary_viewed on saved is the dwell anchor.
  useEffect(() => {
    if (!itinerary || viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    const createdMs = savedCreatedAt
      ? new Date(savedCreatedAt).getTime()
      : null;
    const daysSinceSaved =
      createdMs && !Number.isNaN(createdMs)
        ? Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000))
        : undefined;
    const isRevisit =
      daysSinceSaved !== undefined ? daysSinceSaved > 0 : undefined;
    track(EVENTS.ITINERARY_VIEWED, {
      source: "saved",
      itinerary_id: id,
      is_past: isPastDate(itinerary.inputs.day),
      is_revisit: isRevisit,
      days_since_saved: daysSinceSaved,
    });
  }, [itinerary, id, savedCreatedAt]);

  if (!loaded) return <StepLoading />;

  if (error || !itinerary) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-dvh px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          {error ?? "Something went wrong."}
        </p>
        <Button onClick={() => router.push("/")}>Back home</Button>
      </main>
    );
  }

  const isPast = isPastDate(itinerary.inputs.day);
  return (
    <ItineraryEngagementProvider
      source="saved"
      itineraryId={id}
      composeInputs={itinerary.inputs}
    >
      <main className="flex flex-1 flex-col items-center min-h-dvh pb-32">
        {isLuckyItinerary(itinerary.inputs) ? (
          <LuckyCrown
            header={itinerary.header}
            inputs={itinerary.inputs}
            backHref="/"
            backLabel="← Back"
          />
        ) : (
          <>
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
              <CompositionHeader
                header={itinerary.header}
                inputs={itinerary.inputs}
              />
            </div>
          </>
        )}
        <div className="w-full px-6 mt-6 flex flex-col items-center">
          {isPast && <PastItineraryBanner day={itinerary.inputs.day} />}
          <ItineraryView
            stops={itinerary.stops}
            walks={itinerary.walks}
            date={itinerary.inputs.day}
            partySize={2}
            startTime={itinerary.inputs.startTime}
            isPast={isPast}
            surface="saved"
            isLucky={isLuckyItinerary(itinerary.inputs)}
          />
        </div>
        <ActionBar itinerary={itinerary} />
        {/* Sticky-fixed CTA in initial-saved state — opens ConfirmModal
            directly without re-saving. Restores share + calendar export
            on the saved surface. */}
        <LooksGoodCTA
          itinerary={itinerary}
          initialSavedId={id}
          surface="saved"
        />
      </main>
    </ItineraryEngagementProvider>
  );
}
