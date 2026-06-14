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
import { useSwapStop } from "@/hooks/useSwapStop";
import {
  composeFailure,
  isComposeFailure,
  type ComposeFailure,
} from "@/lib/itinerary/compose-failure";
import {
  EVENTS,
  getAnalyticsHeaders,
  incrementPersonProperty,
  setPersonProperties,
  track,
} from "@/lib/analytics";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { ActionBar } from "@/components/itinerary/ActionBar";
import { LooksGoodCTA } from "@/components/itinerary/LooksGoodCTA";
import {
  ItineraryEngagementProvider,
  useEngagement,
} from "@/components/itinerary/EngagementProvider";
import { SwapReasonModal } from "@/components/itinerary/SwapReasonModal";
import {
  buildSkippedProps,
  buildSubmittedProps,
  handleNextSwapContext,
  type SwapReasonContext,
} from "@/lib/itinerary/swap-reason";
import type { SwapContext } from "@/hooks/useSwapStop";
import { StepLoading } from "@/components/questionnaire/StepLoading";
import { Button } from "@/components/ui/Button";
import { Header } from "@/components/Header";
import { isPastDate } from "@/lib/dateUtils";
import { isLuckyItinerary } from "@/lib/itinerary/is-lucky";
import { LuckyCrown } from "@/components/itinerary/LuckyCrown";

function persist(it: ItineraryResponse) {
  sessionStorage.setItem(
    STORAGE_KEYS.session.currentItinerary,
    JSON.stringify(it)
  );
}

/** Thrown by fetchItinerary when the server returns a 422 with a typed
 * ComposeFailure body. Caught at the page level so the failure state
 * can render the typed title + suggestion. */
class ComposeFailureError extends Error {
  constructor(public readonly failure: ComposeFailure) {
    super(failure.title);
    this.name = "ComposeFailureError";
  }
}

function ItineraryContent() {
  const searchParams = useSearchParams();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Structured failure from the generation endpoint (422 with a typed
  // ComposeFailure body). Held separately from `error` so the UI can
  // render the title + suggestion as a real state instead of a generic
  // "something went wrong."
  const [composeFailureState, setComposeFailureState] =
    useState<ComposeFailure | null>(null);

  // Fire itinerary_viewed exactly once per mount.
  const viewedFiredRef = useRef(false);
  // Fire compose_failure_viewed exactly once when the failure paints.
  const failureViewedFiredRef = useRef(false);

  const updateItinerary = useCallback((next: ItineraryResponse) => {
    setItinerary(next);
    persist(next);
  }, []);

  const fetchItinerary = useCallback(
    async (inputs: GenerateRequestBody, excludeVenueIds: string[] = []) => {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
        body: JSON.stringify({ ...inputs, excludeVenueIds }),
      });
      // 422 is the structured-failure status. The body is a typed
      // ComposeFailure with a title + suggestion the UI surfaces as
      // its own state.
      if (res.status === 422) {
        const body = (await res.json()) as unknown;
        if (isComposeFailure(body)) {
          throw new ComposeFailureError(body);
        }
      }
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
        // Pending compose failure from a failed /api/generate submit
        // on /compose. Read and CONSUME this key first, before any
        // other hydration branch, so a 422 in the questionnaire
        // can't fall through to a stale itinerary still sitting in
        // sessionStorage from a prior compose. Consuming the entry
        // also prevents a back-button revisit from re-firing the
        // failure surface forever — once shown, it's spent.
        const pendingFailure = sessionStorage.getItem(
          STORAGE_KEYS.session.composeFailure,
        );
        if (pendingFailure) {
          sessionStorage.removeItem(STORAGE_KEYS.session.composeFailure);
          try {
            const parsed = JSON.parse(pendingFailure) as unknown;
            if (isComposeFailure(parsed)) {
              setComposeFailureState(parsed);
              setLoading(false);
              return;
            }
          } catch {
            // Malformed payload — fall through to the standard
            // hydration. The next branch will either find an
            // itinerary or surface the "no plan loaded" error.
          }
        }

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
      } catch (err) {
        if (err instanceof ComposeFailureError) {
          setComposeFailureState(err.failure);
        } else {
          setError("That didn't work. Try again.");
        }
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
    track(EVENTS.ITINERARY_VIEWED, {
      source: "fresh",
      itinerary_id: null,
      is_past: isPastDate(itinerary.inputs?.day),
    });
  }, [itinerary]);

  // compose_failure_viewed: fires once when the generate-failure
  // surface paints (distinct from compose_failed which fires
  // server-side at zero-pool). The split matters because not every
  // server-side compose_failed lands in front of a user — if the user
  // backed out before the response returned, the server-side event
  // still fires but no failure was viewed. The viewed event is the
  // funnel's user-side anchor. swap-stop and add-stop fire their own
  // counterparts where their inline error messages paint (see
  // useSwapStop.ts and handleAddStop above).
  useEffect(() => {
    if (!composeFailureState || failureViewedFiredRef.current) return;
    failureViewedFiredRef.current = true;
    track(EVENTS.COMPOSE_FAILURE_VIEWED, {
      endpoint: "generate",
      zeroing_stage: composeFailureState.zeroingStage,
    });
  }, [composeFailureState]);

  if (loading) return <StepLoading />;

  // Structured failure state — server returned a 422 with title +
  // suggestion. Render as a real surface, not a toast.
  if (composeFailureState) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6 text-center">
        <h1 className="font-serif text-3xl text-charcoal mb-3">
          {composeFailureState.title}
        </h1>
        <p className="font-sans text-base text-warm-gray mb-6 max-w-md">
          {composeFailureState.suggestion}
        </p>
        <Button href="/compose">Change your picks</Button>
      </main>
    );
  }

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
    <ItineraryEngagementProvider
      source="fresh"
      itineraryId={null}
      composeInputs={itinerary.inputs}
    >
      <ItineraryBody itinerary={itinerary} updateItinerary={updateItinerary} />
    </ItineraryEngagementProvider>
  );
}

// Lives INSIDE the engagement provider so handleAddStop / handleSwap can
// call useEngagement (notably getTimeSinceViewed for the time_since_viewed_ms
// property on itinerary_extended_to_three). ItineraryContent owns the
// data-loading lifecycle; the body owns user-action handlers.
function ItineraryBody({
  itinerary,
  updateItinerary,
}: {
  itinerary: ItineraryResponse;
  updateItinerary: (next: ItineraryResponse) => void;
}) {
  const { getTimeSinceViewed, trackEngagement } = useEngagement();

  // Swap-reason modal state. Owned at the page level (per Phase 4
  // locked decision 1) so a new swap completing while the modal is
  // still open can fire an implicit `stop_swap_reason_skipped` before
  // overwriting with the new context.
  const [swapReason, setSwapReason] = useState<SwapReasonContext | null>(null);

  // Map of swap-anchor elements, keyed by stop index. Each StopCard
  // registers its action-slot wrapper here on mount (and clears on
  // unmount) so the desktop SwapReasonModal can position its popover
  // against the right swap button after a swap completes. Mobile
  // ignores the anchor and falls back to the bottom sheet.
  //
  // The ref is the durable index (lookup at any index, any time);
  // `swapAnchorEl` below mirrors the slot for the *currently open*
  // swap-reason so a state change re-renders SwapReasonModal with the
  // live element. Reading from the ref directly in render would hand
  // floating-ui the previous commit's wrapper, which is the SAME
  // StopCard that's about to unmount when the swap re-keys it by
  // venue.id — floating-ui would then measure a detached node and
  // pin the popover to (0,0).
  const swapAnchorsRef = useRef<Map<number, HTMLElement | null>>(new Map());
  const [swapAnchorEl, setSwapAnchorEl] = useState<HTMLElement | null>(null);
  // `activeAnchorIndexRef` shadows the open swap-reason's stop index so
  // `registerSwapAnchor` (a stable callback, no deps) can decide
  // whether to push a fresh element into state without re-binding the
  // callback every time swapReason changes.
  const activeAnchorIndexRef = useRef<number | null>(null);
  const registerSwapAnchor = useCallback(
    (i: number, el: HTMLElement | null) => {
      swapAnchorsRef.current.set(i, el);
      if (activeAnchorIndexRef.current === i) {
        setSwapAnchorEl(el);
      }
    },
    [],
  );

  const onSwapComplete = useCallback(
    (ctx: SwapContext) => {
      // A successful swap changed the candidate pool (the swapped venue
      // is now in the exclusion set; an adjacent walk segment changed).
      // The add-stop pool that was previously exhausted may now have
      // honest answers, so clear the failure and let the user retry.
      // Mirrors useSwapStop's symmetric clear of swapFailure on a
      // different-stop swap.
      setAddStopFailure(null);
      setSwapReason((prev) => {
        const { nextState, events } = handleNextSwapContext(
          prev,
          ctx,
          performance.now(),
        );
        // Drain queued events through trackEngagement so ComposeContext +
        // itinerary_id are auto-injected once, not built per-event.
        for (const e of events) {
          if (e.event === "swap_reason_shown") {
            trackEngagement(EVENTS.SWAP_REASON_SHOWN, e.props);
          } else {
            trackEngagement(EVENTS.SWAP_REASON_SKIPPED, e.props);
          }
        }
        return nextState;
      });
    },
    [trackEngagement],
  );

  const handleReasonSubmit = useCallback(
    (reason: string, otherText: string | null) => {
      const current = swapReason;
      if (!current) return;
      const timeToDecisionMs = Math.round(
        performance.now() - current.shownAt,
      );
      const built = buildSubmittedProps(
        current.swapContext,
        reason,
        otherText,
        timeToDecisionMs,
      );
      // Submission is a real engagement (Phase 3 EngagementProvider) —
      // bumps the counter and attaches time_to_first_engagement_ms when
      // this is the user's first interaction with the itinerary.
      // PII split: reason_text is mirror-only — see swap-reason.ts.
      trackEngagement(EVENTS.SWAP_REASON_SUBMITTED, built.props, {
        mirrorOnlyProps: built.mirrorOnlyProps,
      });
      setSwapReason(null);
    },
    [swapReason, trackEngagement],
  );

  const handleReasonSkip = useCallback(() => {
    const current = swapReason;
    if (!current) return;
    trackEngagement(
      EVENTS.SWAP_REASON_SKIPPED,
      buildSkippedProps(current.swapContext),
    );
    setSwapReason(null);
  }, [swapReason, trackEngagement]);

  // Seed `swapAnchorEl` from the ref map whenever the open swap-reason
  // changes. Runs in the effect phase — AFTER ref callbacks have fired
  // for any remounted StopCard (the post-swap re-key happens during
  // the same commit) — so the map.get(...) here reads the LIVE wrapper
  // element, not the previous commit's about-to-detach wrapper. The
  // matching `registerSwapAnchor` branch above covers the inverse
  // race: a StopCard whose ref fires AFTER this effect runs (e.g.,
  // the brand-new StopCard inserted by the same swap commit) still
  // gets pushed into state without a second swapReason dependency.
  useEffect(() => {
    if (!swapReason) {
      activeAnchorIndexRef.current = null;
      setSwapAnchorEl(null);
      return;
    }
    const idx = swapReason.swapContext.stopIndex;
    activeAnchorIndexRef.current = idx;
    setSwapAnchorEl(swapAnchorsRef.current.get(idx) ?? null);
  }, [swapReason]);

  const {
    handleSwap,
    swappingIndex,
    swapFailure,
    swappedIndex,
    undoSwap,
    clearSwapFailure,
  } = useSwapStop(itinerary, updateItinerary, onSwapComplete);

  const [addingStop, setAddingStop] = useState(false);
  // Structured failure for the add-stop pool. Persists (no auto-dismiss)
  // and disables the add-stop affordance — the pool is exhausted given
  // these inputs, so inviting retries against it would be dishonest.
  // Cleared on (a) a successful swap (onSwapComplete: the candidate
  // pool genuinely changed), (b) page navigation. NOT cleared on a
  // successful add-stop because the guard prevents add-stop from
  // running once a failure is set — the only way to re-enable the
  // add-stop button is to first swap something.
  const [addStopFailure, setAddStopFailure] = useState<ComposeFailure | null>(
    null,
  );

  const handleAddStop = async () => {
    if (addingStop || addStopFailure) return;
    setAddingStop(true);
    try {
      const res = await fetch("/api/add-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
        body: JSON.stringify({ itinerary }),
      });
      // 422 → structured ComposeFailure. Render the body verbatim via
      // ComposeFailureBlock (all copy routes through the compose-failure
      // registry — no parallel strings). Fire compose_failure_viewed so
      // the add-stop leg of the funnel matches the server-side
      // compose_failed.
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as unknown;
        const failure = isComposeFailure(body)
          ? body
          : composeFailure("proximity");
        track(EVENTS.COMPOSE_FAILURE_VIEWED, {
          endpoint: "add-stop",
          zeroing_stage: failure.zeroingStage,
        });
        setAddStopFailure(failure);
        setAddingStop(false);
        return;
      }
      if (!res.ok) {
        throw new Error("add-stop failed");
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
      // Audit item 1: symmetric failure clear. onSwapComplete already
      // clears addStopFailure when a swap succeeds; mirror it here so
      // a successful add-stop wipes a stale swap failure block too.
      // The candidate pool genuinely changed, so any prior swap-block
      // exhaustion is no longer accurate.
      clearSwapFailure();
      // Both fire through trackEngagement so ComposeContext +
      // itinerary_id are injected at the single passthrough point and
      // both count toward the engagement counter (the user added a
      // stop — that's the canonical engagement signal).
      trackEngagement(EVENTS.STOP_ADDED, {
        new_stop_count: next.stops.length,
      });
      // Phase 2 extension event. Renamed 2026-06-11
      // (itinerary_extended_to_three → itinerary_extended) once the
      // 3-stop ceiling was lifted and the event needs to carry
      // final_stop_count generically. VenueRef carries the added
      // venue (renamed from added_venue_id / added_venue_name in the
      // legacy payload — VenueRef is the canonical shape).
      trackEngagement(EVENTS.ITINERARY_EXTENDED, {
        venue_id: payload.stop.venue.id,
        venue_name: payload.stop.venue.name,
        original_stop_count: itinerary.stops.length,
        final_stop_count: next.stops.length,
        added_role: payload.stop.role,
        time_since_viewed_ms: getTimeSinceViewed(),
      });
    } catch {
      // Unexpected exception — surface as the same prominent block,
      // routed through the registry with NEUTRAL system copy. proximity's
      // "widen your neighborhood" framing actively misled the user when
      // the cause was actually a 500 or a network drop.
      setAddStopFailure(composeFailure("system"));
    }
    setAddingStop(false);
  };

  return (
    // Bottom padding (pb-32) clears the fixed Looks Good CTA so the
    // last content row (Open in Maps) stays visible when scrolled to
    // the bottom of the page.
    <main className="flex flex-1 flex-col items-center min-h-screen pb-32">
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
        <ItineraryView
          stops={itinerary.stops}
          walks={itinerary.walks}
          date={itinerary.inputs.day}
          partySize={2}
          startTime={itinerary.inputs.startTime}
          onAddStop={handleAddStop}
          isAddingStop={addingStop}
          addStopFailure={addStopFailure}
          onSwapStop={handleSwap}
          swappingIndex={swappingIndex}
          swapFailure={swapFailure}
          swappedIndex={swappedIndex}
          onUndoSwap={undoSwap}
          isLucky={isLuckyItinerary(itinerary.inputs)}
          registerSwapAnchor={registerSwapAnchor}
        />
      </div>
      <ActionBar itinerary={itinerary} />
      {/* Sticky-fixed CTA — position:fixed so its inline location
          doesn't take vertical space; pb-32 on <main> reserves room. */}
      <LooksGoodCTA itinerary={itinerary} />
      <SwapReasonModal
        isOpen={swapReason !== null}
        swappedFromVenueName={swapReason?.swapContext.originalVenue.name ?? ""}
        onSubmit={handleReasonSubmit}
        onSkip={handleReasonSkip}
        anchorEl={swapAnchorEl}
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
