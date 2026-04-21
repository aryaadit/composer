"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
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
import { VenueDetailModal } from "@/components/venue/VenueDetailModal";
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
  const { user } = useAuth();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(false);

  const updateItinerary = useCallback((next: ItineraryResponse) => {
    setItinerary(next);
    persist(next);
  }, []);

  const { handleSwap, swappingIndex, swapError } = useSwapStop(
    itinerary,
    updateItinerary
  );

  // ── Venue detail modal ──────────────────────────────────────
  const [detailVenueIndex, setDetailVenueIndex] = useState<number | null>(null);
  const detailVenue =
    detailVenueIndex !== null && itinerary
      ? itinerary.stops[detailVenueIndex]?.venue ?? null
      : null;

  const fetchItinerary = useCallback(
    async (inputs: GenerateRequestBody, excludeVenueIds: string[] = []) => {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inputs, excludeVenueIds }),
      });
      if (!res.ok) throw new Error("Generation failed");
      return (await res.json()) as ItineraryResponse;
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

  // ── Regenerate ──────────────────────────────────────────────
  const handleRegenerate = async () => {
    if (!itinerary) return;
    setRegenerating(true);
    setRegenError(false);
    try {
      const recentIds = user?.id ? await getRecentVenueIds(user.id) : [];
      const currentIds = itinerary.stops.map((s) => s.venue.id);
      const excludeVenueIds = Array.from(
        new Set([...recentIds, ...currentIds])
      );
      const data = await fetchItinerary(itinerary.inputs, excludeVenueIds);
      updateItinerary(data);
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
        header: {
          ...itinerary.header,
          estimated_total: payload.estimated_total,
        },
      };
      updateItinerary(next);
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
          onVenueTap={setDetailVenueIndex}
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
      <VenueDetailModal
        venue={detailVenue}
        onClose={() => setDetailVenueIndex(null)}
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
