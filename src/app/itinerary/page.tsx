"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  ItineraryResponse,
  ItineraryStop,
  GenerateRequestBody,
  WalkSegment,
} from "@/types";
import { decodeParamsToInputs } from "@/lib/sharing";
import { STORAGE_KEYS } from "@/config/storage";
import { getRecentVenueIds } from "@/lib/exclusions";
import { useAuth } from "@/components/providers/AuthProvider";
import { useSwapStop } from "@/hooks/useSwapStop";
import {
  getAnalyticsHeaders,
  incrementPersonProperty,
  setPersonProperties,
  track,
} from "@/lib/analytics";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { ActionBar } from "@/components/itinerary/ActionBar";
import { StepLoading } from "@/components/questionnaire/StepLoading";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
import { isPastDate } from "@/lib/dateUtils";

function persist(it: ItineraryResponse) {
  sessionStorage.setItem(
    STORAGE_KEYS.session.currentItinerary,
    JSON.stringify(it)
  );
}

function ItineraryContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(false);

  // Bump on every fetchItinerary success — total_itineraries_generated
  // gets +1 for each, and we forward the count to itinerary_regenerated
  // so we can compare "how often do people regenerate."
  const regenerationCountRef = useRef(0);
  // Fire itinerary_viewed exactly once per mount (not on regen).
  const viewedFiredRef = useRef(false);

  const updateItinerary = useCallback((next: ItineraryResponse) => {
    setItinerary(next);
    persist(next);
  }, []);

  const { handleSwap, swappingIndex, swapError } = useSwapStop(
    itinerary,
    updateItinerary
  );

  const fetchItinerary = useCallback(
    async (inputs: GenerateRequestBody, excludeVenueIds: string[] = []) => {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
        body: JSON.stringify({ ...inputs, excludeVenueIds }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = (await res.json()) as ItineraryResponse;
      // Person property bumps — done client-side per spec so they fire
      // regardless of whether the server-side capture succeeded.
      incrementPersonProperty("total_itineraries_generated", 1);
      setPersonProperties({ last_active_at: new Date().toISOString() });
      return data;
    },
    []
  );

  useEffect(() => {
    async function load() {
      try {
        const paramsInputs = decodeParamsToInputs(searchParams);
        if (paramsInputs) {
          const data = await fetchItinerary(paramsInputs);
          setItinerary(data);
          setLoading(false);
          return;
        }
        const stored = sessionStorage.getItem(
          STORAGE_KEYS.session.currentItinerary
        );
        if (stored) {
          setItinerary(JSON.parse(stored));
          setLoading(false);
          return;
        }
        setError("We don't have a plan loaded. Start from the top.");
        setLoading(false);
      } catch {
        setError("That didn't work. Try again.");
        setLoading(false);
      }
    }
    load();
  }, [searchParams, fetchItinerary]);

  // itinerary_viewed: fires once after the itinerary lands on this fresh
  // surface. Skipped on the saved/share routes — they have their own
  // page components that fire with the appropriate `source`.
  useEffect(() => {
    if (!itinerary || viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    track("itinerary_viewed", {
      source: "fresh",
      itinerary_id: null,
      is_past: isPastDate(itinerary.inputs?.day),
    });
  }, [itinerary]);

  // ── Regenerate ──────────────────────────────────────────────
  const handleRegenerate = async () => {
    if (!itinerary) return;
    setRegenerating(true);
    setRegenError(false);
    try {
      // Exclude venues from saved plans + the current plan's venues so
      // Regenerate can't return the plan the user is looking at.
      const recentIds = user?.id ? await getRecentVenueIds(user.id) : [];
      const currentIds = itinerary.stops.map((s) => s.venue.id);
      const excludeVenueIds = Array.from(
        new Set([...recentIds, ...currentIds])
      );
      const data = await fetchItinerary(itinerary.inputs, excludeVenueIds);
      updateItinerary(data);
      regenerationCountRef.current += 1;
      track("itinerary_regenerated", {
        occasion: itinerary.inputs.occasion,
        neighborhoods: itinerary.inputs.neighborhoods,
        budget: itinerary.inputs.budget,
        vibe: itinerary.inputs.vibe,
        start_time: itinerary.inputs.startTime,
        day: itinerary.inputs.day,
        regeneration_count: regenerationCountRef.current,
      });
    } catch {
      setRegenError(true);
      setTimeout(() => setRegenError(false), 3000);
    }
    setRegenerating(false);
  };

  // ── Add stop ────────────────────────────────────────────────
  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  const handleAddStop = async () => {
    if (!itinerary || addingStop) return;
    setAddingStop(true);
    setAddStopError(null);
    try {
      const res = await fetch("/api/add-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
        body: JSON.stringify({ itinerary }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.error ?? "Couldn't add a stop");
      }
      const payload = (await res.json()) as {
        stop: ItineraryStop;
        walk: WalkSegment;
        maps_url: string;
        estimated_total: string;
      };
      const next: ItineraryResponse = {
        ...itinerary,
        stops: [...itinerary.stops, payload.stop],
        walks: [...itinerary.walks, payload.walk],
        maps_url: payload.maps_url,
        header: {
          ...itinerary.header,
          estimated_total: payload.estimated_total,
        },
      };
      updateItinerary(next);
      track("stop_added", {
        new_stop_count: next.stops.length,
        occasion: itinerary.inputs.occasion,
        neighborhoods: itinerary.inputs.neighborhoods,
        budget: itinerary.inputs.budget,
        vibe: itinerary.inputs.vibe,
        start_time: itinerary.inputs.startTime,
      });
    } catch (err) {
      setAddStopError(
        err instanceof Error ? err.message : "Couldn't add a stop"
      );
      setTimeout(() => setAddStopError(null), 3000);
    }
    setAddingStop(false);
  };

  if (loading) return <StepLoading />;

  if (error || !itinerary) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          {error ?? "Something went wrong."}
        </p>
        <Button href="/compose">Start Over</Button>
      </main>
    );
  }

  return (
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
      {regenerating ? (
        <div className="w-full max-w-lg py-16">
          <StepLoading />
        </div>
      ) : (
        <ItineraryView
          stops={itinerary.stops}
          walks={itinerary.walks}
          date={itinerary.inputs.day}
          partySize={2}
          onAddStop={handleAddStop}
          isAddingStop={addingStop}
          onSwapStop={handleSwap}
          swappingIndex={swappingIndex}
          swapError={swapError}
        />
      )}
      {regenError && (
        <p className="font-sans text-sm text-charcoal mt-4">
          Couldn&apos;t regenerate — keeping your current night.
        </p>
      )}
      {addStopError && (
        <p className="font-sans text-sm text-charcoal mt-4">{addStopError}</p>
      )}
      </div>
      <ActionBar
        itinerary={itinerary}
        onRegenerate={handleRegenerate}
        isRegenerating={regenerating}
      />
    </main>
  );
}

export default function ItineraryPage() {
  return (
    <Suspense fallback={<StepLoading />}>
      <ItineraryContent />
    </Suspense>
  );
}
