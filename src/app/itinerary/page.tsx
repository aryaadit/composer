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
  isComposeFailure,
  type ComposeFailure,
} from "@/lib/itinerary/compose-failure";
import {
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
    track("itinerary_viewed", {
      source: "fresh",
      itinerary_id: null,
      is_past: isPastDate(itinerary.inputs?.day),
    });
  }, [itinerary]);

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
    <ItineraryEngagementProvider source="fresh" itineraryId={null}>
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

  const onSwapComplete = useCallback((ctx: SwapContext) => {
    setSwapReason((prev) =>
      handleNextSwapContext(prev, ctx, performance.now(), track),
    );
  }, []);

  const handleReasonSubmit = useCallback(
    (reason: string, otherText: string | null) => {
      const current = swapReason;
      if (!current) return;
      const timeToDecisionMs = Math.round(
        performance.now() - current.shownAt,
      );
      // Submission is a real engagement (Phase 3 EngagementProvider) —
      // bumps the counter and attaches time_to_first_engagement_ms when
      // this is the user's first interaction with the itinerary.
      trackEngagement(
        "stop_swap_reason_submitted",
        buildSubmittedProps(
          current.swapContext,
          reason,
          otherText,
          timeToDecisionMs,
        ),
      );
      setSwapReason(null);
    },
    [swapReason, trackEngagement],
  );

  const handleReasonSkip = useCallback(() => {
    const current = swapReason;
    if (!current) return;
    track("stop_swap_reason_skipped", buildSkippedProps(current.swapContext));
    setSwapReason(null);
  }, [swapReason]);

  const { handleSwap, swappingIndex, swapError } = useSwapStop(
    itinerary,
    updateItinerary,
    onSwapComplete,
  );

  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  const handleAddStop = async () => {
    if (addingStop) return;
    setAddingStop(true);
    setAddStopError(null);
    try {
      const res = await fetch("/api/add-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
        body: JSON.stringify({ itinerary }),
      });
      // 422 → structured ComposeFailure. Surface the typed title as
      // the inline error message so the user sees the same brand-voice
      // copy as the compose page.
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as {
          title?: string;
        };
        throw new Error(body.title ?? "Couldn't add a stop");
      }
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
      // Phase 2 extension event. Fires alongside stop_added so the
      // existing engagement count is preserved, and adds extension-
      // specific properties (added venue, role, vibe, time-since-viewed).
      // original_stop_count is the count BEFORE this add; final is after.
      track("itinerary_extended_to_three", {
        original_stop_count: itinerary.stops.length,
        final_stop_count: next.stops.length,
        added_venue_id: payload.stop.venue.id,
        added_venue_name: payload.stop.venue.name,
        added_role: payload.stop.role,
        vibe: itinerary.inputs.vibe,
        time_since_viewed_ms: getTimeSinceViewed(),
      });
    } catch (err) {
      setAddStopError(
        err instanceof Error ? err.message : "Couldn't add a stop"
      );
      setTimeout(() => setAddStopError(null), 3000);
    }
    setAddingStop(false);
  };

  return (
    // Bottom padding (pb-32) clears the fixed Looks Good CTA so the
    // last content row (Open in Maps) stays visible when scrolled to
    // the bottom of the page.
    <main className="flex flex-1 flex-col items-center min-h-screen pb-32">
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
        <ItineraryView
          stops={itinerary.stops}
          walks={itinerary.walks}
          date={itinerary.inputs.day}
          partySize={2}
          startTime={itinerary.inputs.startTime}
          onAddStop={handleAddStop}
          isAddingStop={addingStop}
          onSwapStop={handleSwap}
          swappingIndex={swappingIndex}
          swapError={swapError}
        />
        {addStopError && (
          <p className="font-sans text-sm text-charcoal mt-4">{addStopError}</p>
        )}
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
