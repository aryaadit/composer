"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { getAnalyticsHeaders } from "@/lib/analytics";
import type {
  ItineraryResponse,
  ItineraryStop,
  StopRole,
  Venue,
  WalkSegment,
} from "@/types";

interface SwapState {
  swappingIndex: number | null;
  swapError: { index: number; message: string } | null;
}

/**
 * Context passed to onSwapComplete when a swap successfully resolves.
 * Carries everything the swap-reason modal + its analytics events need.
 * `surface` future-proofs the schema if swap is ever enabled on saved
 * or share surfaces — fresh is the only surface today.
 */
export interface SwapContext {
  stopIndex: number;
  stopRole: StopRole;
  originalVenue: Venue;
  newVenue: Venue;
  vibe: string;
  surface: "fresh_itinerary" | "saved" | "share";
}

export function useSwapStop(
  itinerary: ItineraryResponse | null,
  onUpdate: (next: ItineraryResponse) => void,
  onSwapComplete?: (ctx: SwapContext) => void,
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
          headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
          body: JSON.stringify({
            itinerary,
            stopIndex: index,
            excludeVenueIds: excluded,
          }),
        });

        // 422 is the new structured-failure path (typed ComposeFailure).
        // The UI shows the title as the toast message — the body
        // suggestion would require restructuring the toast widget, so
        // we surface the headline here and let the user retry with
        // different inputs from the questionnaire if needed.
        if (res.status === 422) {
          const body = (await res.json().catch(() => ({}))) as {
            failed?: boolean;
            title?: string;
          };
          setState({
            swappingIndex: null,
            swapError: {
              index,
              message: body.title ?? "No other good matches right now",
            },
          });
          setTimeout(
            () => setState((s) => ({ ...s, swapError: null })),
            5000
          );
          return;
        }
        // Legacy 404 fallback — pre-refactor swap-stop returned this
        // for any zero-pool condition. Left in place defensively.
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
        const prevStop = itinerary.stops[index];
        const originalVenue = prevStop.venue;
        const prevVenueId = originalVenue.id;

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

        // Fire the swap-completion callback AFTER onUpdate so the new
        // venue has already rendered when the modal mounts. The modal
        // appears over the freshly-swapped stop, not over the spinner.
        // The role is preserved across the swap, so payload.stop.role
        // === prevStop.role; we use the new stop for consistency with
        // the rest of the response shape.
        onSwapComplete?.({
          stopIndex: index,
          stopRole: payload.stop.role,
          originalVenue,
          newVenue: payload.stop.venue,
          vibe: itinerary.inputs.vibe,
          surface: "fresh_itinerary",
        });

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
    [itinerary, state.swappingIndex, toast, onUpdate, onSwapComplete]
  );

  return {
    handleSwap,
    swappingIndex: state.swappingIndex,
    swapError: state.swapError,
  };
}
