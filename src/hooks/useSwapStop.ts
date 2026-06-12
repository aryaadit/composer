"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EVENTS, getAnalyticsHeaders, track } from "@/lib/analytics";
import {
  composeFailure,
  isComposeFailure,
  type ComposeFailure,
} from "@/lib/itinerary/compose-failure";
import type {
  ItineraryResponse,
  ItineraryStop,
  StopRole,
  Venue,
  WalkSegment,
} from "@/types";

interface SwapState {
  swappingIndex: number | null;
  /** Structured failure for the stop the user just tried to swap. Persists
   *  (no auto-dismiss) — the pool for this stop is exhausted given the
   *  user's inputs, so inviting retries against it would be dishonest.
   *  Cleared on a successful swap at a different stop or on page nav. */
  swapFailure: { index: number; failure: ComposeFailure } | null;
  /** Index of the stop that JUST swapped successfully. Drives the
   *  in-context "Swapped · Undo" line the StopCard renders inline,
   *  replacing the deleted Toast pattern (audit item 19). Persists
   *  for ~8s or until the next user action. */
  swappedIndex: number | null;
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

interface UndoEntry {
  timer: number;
  index: number;
  restore: () => void;
}

export function useSwapStop(
  itinerary: ItineraryResponse | null,
  onUpdate: (next: ItineraryResponse) => void,
  onSwapComplete?: (ctx: SwapContext) => void,
) {
  const [state, setState] = useState<SwapState>({
    swappingIndex: null,
    swapFailure: null,
    swappedIndex: null,
  });

  const excludedRef = useRef<Map<number, string[]>>(new Map());
  // Auto-clear timer for the "Swapped · Undo" inline notice. The
  // restore closure stored on undoRef is what the StopCard's Undo
  // affordance calls — see consumer in src/app/itinerary/page.tsx.
  const undoRef = useRef<UndoEntry | null>(null);

  // Cancel any pending "Swapped · Undo" auto-clear if the consumer
  // unmounts inside the 8s window (e.g. user taps the Header's Back
  // link right after a swap). Without this the queued setState would
  // land on an unmounted component — a no-op in React 18 but a real
  // bug under StrictMode double-invoke and a regression from the
  // dismiss-contract the deleted Toast component owned. Added after
  // the visual-audit adversarial review, 2026-06-12.
  useEffect(() => {
    return () => {
      if (undoRef.current) {
        window.clearTimeout(undoRef.current.timer);
        undoRef.current = null;
      }
    };
  }, []);

  const handleSwap = useCallback(
    async (index: number) => {
      if (!itinerary || state.swappingIndex !== null) return;
      // Clear any prior failure AND any prior swapped-notice when the
      // user retries a DIFFERENT stop (or this stop after a manual
      // reset). The exhaustion block on the prior failed stop disabled
      // its own Swap, so we won't land here for that stop while its
      // failure is showing.
      if (undoRef.current) {
        window.clearTimeout(undoRef.current.timer);
        undoRef.current = null;
      }
      setState({
        swappingIndex: index,
        swapFailure: null,
        swappedIndex: null,
      });

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

        // 422 is the structured-failure path. The response body IS the
        // typed ComposeFailure (failed, zeroingStage, title, suggestion)
        // — we render it verbatim via ComposeFailureBlock, so all copy
        // routes through the compose-failure registry (no parallel
        // strings in this hook). Failure persists (no setTimeout) and
        // the consuming UI disables the Swap affordance on this stop,
        // because the pool is exhausted given these inputs.
        if (res.status === 422) {
          // 422 path also needs to clear any lingering swappedIndex
          // from a prior successful swap — otherwise the failure block
          // and the Undo line would both render at the same stop.
          if (undoRef.current) {
            window.clearTimeout((undoRef.current as UndoEntry).timer);
            undoRef.current = null;
          }
          const body = (await res.json().catch(() => ({}))) as unknown;
          const failure = isComposeFailure(body)
            ? body
            : composeFailure("proximity");
          track(EVENTS.COMPOSE_FAILURE_VIEWED, {
            endpoint: "swap-stop",
            zeroing_stage: failure.zeroingStage,
          });
          setState({
            swappingIndex: null,
            swapFailure: { index, failure },
            swappedIndex: null,
          });
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
          window.clearTimeout((undoRef.current as UndoEntry).timer);
          undoRef.current = null;
        }

        // Capture the restore closure so the StopCard's Undo
        // affordance can call it. The auto-clear timer wipes the
        // swappedIndex state at 8s, matching the deleted Toast's
        // visible duration so user mental model is unchanged.
        const restore = () => {
          excludedRef.current.set(
            index,
            nextExcluded.filter((id) => id !== prevVenueId),
          );
          onUpdate(prevItinerary);
        };
        const timer = window.setTimeout(() => {
          undoRef.current = null;
          setState((s) =>
            s.swappedIndex === index ? { ...s, swappedIndex: null } : s,
          );
        }, 8000);
        undoRef.current = { timer, index, restore };
        setState({
          swappingIndex: null,
          swapFailure: null,
          swappedIndex: index,
        });
        return;
      } catch {
        // Unexpected exception — surface as the same prominent block,
        // but with NEUTRAL system copy. proximity's "widen your
        // neighborhood" framing was actively misleading when the
        // underlying cause was a network drop or a 500.
        setState({
          swappingIndex: null,
          swapFailure: { index, failure: composeFailure("system") },
          swappedIndex: null,
        });
        return;
      }
      // Unreachable — every branch (422, 500, success, catch) returns.
    },
    [itinerary, state.swappingIndex, onUpdate, onSwapComplete],
  );

  /** Externally clear any failure block — symmetric to onSwapComplete
   *  clearing addStopFailure. The page calls this from handleAddStop's
   *  success path so a successful add-stop also wipes a stale swap
   *  failure (the candidate pool genuinely changed). Audit item 1. */
  const clearSwapFailure = useCallback(() => {
    setState((s) => (s.swapFailure ? { ...s, swapFailure: null } : s));
  }, []);

  /** Restore the pre-swap itinerary and clear the swapped notice.
   *  Called by the StopCard's inline "Undo" affordance (replaces the
   *  deleted Toast pattern). No-op if there's nothing to undo. */
  const undoSwap = useCallback(() => {
    if (!undoRef.current) return;
    window.clearTimeout(undoRef.current.timer);
    const { restore, index } = undoRef.current;
    undoRef.current = null;
    restore();
    setState((s) =>
      s.swappedIndex === index ? { ...s, swappedIndex: null } : s,
    );
  }, []);

  return {
    handleSwap,
    swappingIndex: state.swappingIndex,
    swapFailure: state.swapFailure,
    swappedIndex: state.swappedIndex,
    undoSwap,
    clearSwapFailure,
  };
}
