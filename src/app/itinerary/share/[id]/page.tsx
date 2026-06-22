"use client";

// Public shared itinerary view — no auth required. Fetches the
// snapshot from composer_shared_itineraries (public SELECT policy)
// and renders using the same components as the authenticated view.
// Read-only: no save, no regenerate, no add-stop.

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { track, EVENTS } from "@/lib/analytics";
import { useAuth } from "@/components/providers/AuthProvider";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { PastItineraryBanner } from "@/components/itinerary/PastItineraryBanner";
import {
  ItineraryEngagementProvider,
  useEngagement,
} from "@/components/itinerary/EngagementProvider";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { isPastDate } from "@/lib/dateUtils";
import { isLuckyItinerary } from "@/lib/itinerary/is-lucky";
import { LuckyCrown } from "@/components/itinerary/LuckyCrown";
import type { ItineraryResponse } from "@/types";

type LoadState =
  | { status: "loading" }
  | { status: "found"; itinerary: ItineraryResponse }
  | { status: "not-found" };

export default function SharedItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const visitedFiredRef = useRef(false);
  const viewedFiredRef = useRef(false);

  // share_link_visited fires once per mount, the moment we know if the
  // record exists. is_owner is always false today — composer_shared_
  // itineraries doesn't store a user_id (see migration 20260420). If we
  // ever add ownership, compare here against user.id.
  useEffect(() => {
    if (state.status === "loading" || visitedFiredRef.current) return;
    visitedFiredRef.current = true;
    track(EVENTS.SHARE_LINK_VISITED, {
      share_id: id,
      is_authenticated: !!user,
      is_owner: false,
      found: state.status === "found",
    });
  }, [state.status, id, user]);

  // itinerary_viewed fires once per mount, after the share record
  // resolves to a real itinerary. Skipped on not-found.
  useEffect(() => {
    if (state.status !== "found" || viewedFiredRef.current) return;
    viewedFiredRef.current = true;
    track(EVENTS.ITINERARY_VIEWED, {
      source: "share",
      itinerary_id: id,
      is_past: isPastDate(state.itinerary.inputs?.day),
    });
  }, [state, id]);

  useEffect(() => {
    let cancelled = false;
    getSupabase()
      .from("composer_shared_itineraries")
      .select("itinerary")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState({ status: "not-found" });
          return;
        }
        setState({
          status: "found",
          itinerary: data.itinerary as ItineraryResponse,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center min-h-dvh bg-cream">
        <div
          role="status"
          aria-label="Loading shared plan"
          className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin"
        />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-dvh px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          This shared plan doesn&apos;t exist or has expired.
        </p>
        <Button href="/">Compose your own</Button>
      </main>
    );
  }

  const { itinerary } = state;
  const isPast = isPastDate(itinerary.inputs?.day);
  return (
    <ItineraryEngagementProvider
      source="share"
      itineraryId={id}
      composeInputs={itinerary.inputs ?? null}
    >
      <main className="flex flex-1 flex-col items-center min-h-dvh pb-8">
        {isLuckyItinerary(itinerary.inputs) ? (
          <LuckyCrown
            header={itinerary.header}
            inputs={itinerary.inputs}
          />
        ) : (
          <>
            <Header />
            <div className="w-full px-6 mt-6 flex flex-col items-center">
              <CompositionHeader
                header={itinerary.header}
                inputs={itinerary.inputs}
              />
            </div>
          </>
        )}
        <div className="w-full px-6 mt-6 flex flex-col items-center">
          {isPast && <PastItineraryBanner day={itinerary.inputs?.day} />}
          <ItineraryView
            stops={itinerary.stops}
            walks={itinerary.walks}
            date={itinerary.inputs?.day}
            partySize={2}
            startTime={itinerary.inputs?.startTime}
            isPast={isPast}
            surface="share"
            isLucky={isLuckyItinerary(itinerary.inputs)}
          />
          <ShareFooter
            mapsUrl={itinerary.maps_url}
            stopCount={itinerary.stops.length}
          />
        </div>
      </main>
    </ItineraryEngagementProvider>
  );
}

// Footer extracted so it can call useEngagement (the share page itself
// renders the provider, so its component body is outside the provider's
// scope). "Compose your own" is intentionally not an engagement event —
// it's a recipient-facing marketing CTA, different actor from the
// itinerary owner.
function ShareFooter({
  mapsUrl,
  stopCount,
}: {
  mapsUrl: string;
  stopCount: number;
}) {
  const { trackEngagement } = useEngagement();
  return (
    <div className="w-full max-w-lg mx-auto mt-10 pt-4 border-t border-border">
      <div className="flex items-center justify-between font-sans text-sm">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackEngagement(EVENTS.DIRECTIONS_OPENED, {
              surface: "multi_stop_cta",
              stop_count: stopCount,
            })
          }
          className="text-charcoal hover:text-burgundy transition-colors inline-flex items-center gap-1"
        >
          Open in Maps
          <span aria-hidden className="text-muted">→</span>
        </a>
        <Link
          href="/compose"
          className="text-burgundy hover:text-burgundy-light transition-colors font-medium"
        >
          Compose your own →
        </Link>
      </div>
    </div>
  );
}
