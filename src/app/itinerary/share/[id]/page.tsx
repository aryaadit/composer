"use client";

// Public shared itinerary view — no auth required. Fetches the
// snapshot from composer_shared_itineraries (public SELECT policy)
// and renders using the same components as the authenticated view.
// Read-only: no save, no regenerate, no add-stop.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { CompositionHeader } from "@/components/itinerary/CompositionHeader";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
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
  const [state, setState] = useState<LoadState>({ status: "loading" });

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
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center min-h-screen px-6">
        <p className="font-sans text-lg text-warm-gray mb-6">
          This shared plan doesn&apos;t exist or has expired.
        </p>
        <Button href="/">Compose your own</Button>
      </main>
    );
  }

  const { itinerary } = state;
  return (
    <main className="flex flex-1 flex-col items-center min-h-screen pb-8">
      <Header />
      <div className="w-full px-6 mt-6 flex flex-col items-center">
        <CompositionHeader header={itinerary.header} inputs={itinerary.inputs} />
      <ItineraryView
        stops={itinerary.stops}
        walks={itinerary.walks}
        timeBlock={itinerary.inputs?.timeBlock}
        date={itinerary.inputs?.day}
        partySize={2}
      />

      {/* Minimal footer — Maps link + CTA to make their own */}
      <div className="w-full max-w-lg mx-auto mt-10 pt-4 border-t border-border">
        <div className="flex items-center justify-between font-sans text-sm">
          <a
            href={itinerary.maps_url}
            target="_blank"
            rel="noopener noreferrer"
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
      </div>
    </main>
  );
}
