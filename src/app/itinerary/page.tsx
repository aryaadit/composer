"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  ItineraryResponse,
  ItineraryStop,
  GenerateRequestBody,
  WalkSegment,
} from "@/types";
import { decodeParamsToInputs } from "@/lib/sharing";
import { STORAGE_KEYS } from "@/config/storage";
import { useToast } from "@/components/ui/Toast";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { ActionBar } from "@/components/itinerary/ActionBar";
import { StepLoading } from "@/components/questionnaire/StepLoading";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";

function persist(it: ItineraryResponse) {
  sessionStorage.setItem(
    STORAGE_KEYS.session.currentItinerary,
    JSON.stringify(it)
  );
}

function ItineraryContent() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(false);

  const fetchItinerary = useCallback(async (inputs: GenerateRequestBody) => {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });
    if (!res.ok) throw new Error("Generation failed");
    return (await res.json()) as ItineraryResponse;
  }, []);

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
        const stored = sessionStorage.getItem(STORAGE_KEYS.session.currentItinerary);
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

  // ── Regenerate ──────────────────────────────────────────────
  const handleRegenerate = async () => {
    if (!itinerary) return;
    setRegenerating(true);
    setRegenError(false);
    try {
      const data = await fetchItinerary(itinerary.inputs);
      setItinerary(data);
      persist(data);
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
        headers: { "Content-Type": "application/json" },
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
        header: { ...itinerary.header, estimated_total: payload.estimated_total },
      };
      setItinerary(next);
      persist(next);
    } catch (err) {
      setAddStopError(err instanceof Error ? err.message : "Couldn't add a stop");
      setTimeout(() => setAddStopError(null), 3000);
    }
    setAddingStop(false);
  };

  // ── Swap stop ───────────────────────────────────────────────
  // Tracks which venues have been rejected per slot so the user
  // cycles through new options instead of seeing the same one.
  const excludedRef = useRef<Map<number, string[]>>(new Map());
  const undoRef = useRef<{ timer: number; prev: ItineraryResponse } | null>(null);
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [swapError, setSwapError] = useState<{
    index: number;
    message: string;
  } | null>(null);

  const handleSwap = useCallback(
    async (index: number) => {
      if (!itinerary || swappingIndex !== null) return;
      setSwappingIndex(index);
      setSwapError(null);

      const excluded = excludedRef.current.get(index) ?? [];

      try {
        const res = await fetch("/api/swap-stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itinerary,
            stopIndex: index,
            excludeVenueIds: excluded,
          }),
        });

        if (!res.ok) {
          const msg = await res.json().catch(() => ({}));
          setSwapError({
            index,
            message: msg.error ?? "No other good matches right now",
          });
          setTimeout(() => setSwapError(null), 5000);
          setSwappingIndex(null);
          return;
        }

        const payload = (await res.json()) as {
          stop: ItineraryStop;
          walks: { before: WalkSegment | null; after: WalkSegment | null };
          maps_url: string;
          estimated_total: string;
        };

        const prevItinerary = itinerary;
        const prevVenueId = itinerary.stops[index].venue.id;

        // Track the rejected venue so tapping Swap again gives a new one.
        const nextExcluded = [...excluded, prevVenueId];
        excludedRef.current.set(index, nextExcluded);

        // Patch the itinerary in-place.
        const nextStops = [...itinerary.stops];
        nextStops[index] = payload.stop;

        const nextWalks = [...itinerary.walks];
        if (index > 0 && payload.walks.before) {
          nextWalks[index - 1] = payload.walks.before;
        }
        if (index < nextStops.length - 1 && payload.walks.after) {
          nextWalks[index] = payload.walks.after;
        }

        const next: ItineraryResponse = {
          ...itinerary,
          stops: nextStops,
          walks: nextWalks,
          maps_url: payload.maps_url,
          header: {
            ...itinerary.header,
            estimated_total: payload.estimated_total,
          },
        };

        setItinerary(next);
        persist(next);

        // Undo window — 8 seconds to revert.
        if (undoRef.current) window.clearTimeout(undoRef.current.timer);
        const timer = window.setTimeout(() => {
          undoRef.current = null;
        }, 8000);
        undoRef.current = { timer, prev: prevItinerary };

        toast.show({
          message: "Swapped",
          durationMs: 8000,
          action: {
            label: "Undo",
            onClick: () => {
              if (!undoRef.current) return;
              window.clearTimeout(undoRef.current.timer);
              const restored = undoRef.current.prev;
              undoRef.current = null;
              excludedRef.current.set(
                index,
                nextExcluded.filter((id) => id !== prevVenueId)
              );
              setItinerary(restored);
              persist(restored);
            },
          },
        });
      } catch {
        setSwapError({ index, message: "Something went wrong." });
        setTimeout(() => setSwapError(null), 3000);
      }
      setSwappingIndex(null);
    },
    [itinerary, swappingIndex, toast]
  );

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
    <main className="flex flex-1 flex-col items-center min-h-screen px-6 pt-6 pb-8">
      <div className="w-full max-w-lg mx-auto mb-6">
        <Header showBack backHref="/" />
      </div>
      <CompositionHeader header={itinerary.header} />
      {regenerating ? (
        <div className="w-full max-w-lg py-16">
          <StepLoading />
        </div>
      ) : (
        <ItineraryView
          stops={itinerary.stops}
          walks={itinerary.walks}
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
