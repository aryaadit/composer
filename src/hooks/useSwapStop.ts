"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { ItineraryResponse, ItineraryStop, WalkSegment } from "@/types";

interface SwapState {
  swappingIndex: number | null;
  swapError: { index: number; message: string } | null;
}

export function useSwapStop(
  itinerary: ItineraryResponse | null,
  onUpdate: (next: ItineraryResponse) => void
) {
  const toast = useToast();
  const [state, setState] = useState<SwapState>({
    swappingIndex: null,
    swapError: null,
  });

  const excludedRef = useRef<Map<number, string[]>>(new Map());
  const undoRef = useRef<{ timer: number; prev: ItineraryResponse } | null>(
    null
  );

  const handleSwap = useCallback(
    async (index: number) => {
      if (!itinerary || state.swappingIndex !== null) return;
      setState({ swappingIndex: index, swapError: null });

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

        if (res.status === 404) {
          const msg = await res.json().catch(() => ({}));
          setState({
            swappingIndex: null,
            swapError: {
              index,
              message: msg.error ?? "No other good matches right now",
            },
          });
          setTimeout(
            () => setState((s) => ({ ...s, swapError: null })),
            5000
          );
          return;
        }

        if (!res.ok) throw new Error("Swap failed");

        const payload = (await res.json()) as {
          stop: ItineraryStop;
          walks: { before: WalkSegment | null; after: WalkSegment | null };
          maps_url: string;
          estimated_total: string;
        };

        const prevItinerary = itinerary;
        const prevVenueId = itinerary.stops[index].venue.id;

        const nextExcluded = [...excluded, prevVenueId];
        excludedRef.current.set(index, nextExcluded);

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

        onUpdate(next);

        if (undoRef.current) {
          window.clearTimeout(undoRef.current.timer);
          undoRef.current = null;
        }

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
              onUpdate(restored);
            },
          },
        });
      } catch {
        setState({
          swappingIndex: null,
          swapError: { index, message: "Something went wrong." },
        });
        setTimeout(
          () => setState((s) => ({ ...s, swapError: null })),
          3000
        );
        return;
      }
      setState({ swappingIndex: null, swapError: null });
    },
    [itinerary, state.swappingIndex, toast, onUpdate]
  );

  return {
    handleSwap,
    swappingIndex: state.swappingIndex,
    swapError: state.swapError,
  };
}
