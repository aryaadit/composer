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
import { SavedVenuesProvider } from "@/components/providers/SavedVenuesProvider";
import { getSavedVenueIds } from "@/lib/auth";
import { useSwapStop } from "@/hooks/useSwapStop";
import { walkDistanceKm, walkTimeMinutes, buildGoogleMapsUrl } from "@/lib/geo";
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

function recomputeWalks(stops: ItineraryStop[]): WalkSegment[] {
  const walks: WalkSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i].venue;
    const b = stops[i + 1].venue;
    if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) continue;
    walks.push({
      from: a.name,
      to: b.name,
      distance_km: walkDistanceKm(a.latitude, a.longitude, b.latitude, b.longitude),
      walk_minutes: walkTimeMinutes(a.latitude, a.longitude, b.latitude, b.longitude),
    });
  }
  return walks;
}

function ItineraryContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState(false);
  const excludeVenueIdsRef = useRef<Set<string>>(new Set());

  // Saved venues — hydrate once for the heart buttons.
  const [savedVenueIds, setSavedVenueIds] = useState<string[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    void getSavedVenueIds(user.id).then(setSavedVenueIds);
  }, [user?.id]);

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
      // Exclude venues from saved plans + the current plan's venues so
      // Regenerate can't return the plan the user is looking at.
      const recentIds = user?.id ? await getRecentVenueIds(user.id) : [];
      const currentIds = itinerary.stops.map((s) => s.venue.id);
      const excludeVenueIds = Array.from(
        new Set([...recentIds, ...currentIds, ...excludeVenueIdsRef.current])
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

  // ── Remove stop ─────────────────────────────────────────────
  const handleRemoveStop = useCallback(
    (index: number) => {
      if (!itinerary || itinerary.stops.length <= 2) return;
      const removed = itinerary.stops[index];
      const snapshot = itinerary;

      const nextStops = itinerary.stops.filter((_, i) => i !== index);
      const nextWalks = recomputeWalks(nextStops);
      const nextMapsUrl = buildGoogleMapsUrl(
        nextStops.map((s) => ({ latitude: s.venue.latitude!, longitude: s.venue.longitude! }))
      );
      const next: ItineraryResponse = {
        ...itinerary,
        stops: nextStops,
        walks: nextWalks,
        maps_url: nextMapsUrl,
      };
      updateItinerary(next);
      excludeVenueIdsRef.current.add(removed.venue.id);

      toast.show({
        message: `${removed.venue.name} removed`,
        durationMs: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            updateItinerary(snapshot);
            excludeVenueIdsRef.current.delete(removed.venue.id);
          },
        },
        onTimeout: () => {
          excludeVenueIdsRef.current.add(removed.venue.id);
        },
      });
    },
    [itinerary, updateItinerary, toast]
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
    <SavedVenuesProvider initialIds={savedVenueIds}>
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
          timeBlock={itinerary.inputs.timeBlock}
          date={itinerary.inputs.day}
          partySize={2}
          onAddStop={handleAddStop}
          isAddingStop={addingStop}
          onSwapStop={handleSwap}
          onRemoveStop={itinerary.stops.length > 2 ? handleRemoveStop : undefined}
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
    </SavedVenuesProvider>
  );
}

export default function ItineraryPage() {
  return (
    <Suspense fallback={<StepLoading />}>
      <ItineraryContent />
    </Suspense>
  );
}
