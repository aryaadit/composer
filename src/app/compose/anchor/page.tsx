"use client";

// /compose/anchor — "I already have a spot" flow.
// Search → Confirm → Generate with the venue pinned.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { AnchorSearch } from "@/components/anchor/AnchorSearch";
import { AnchorConfirm } from "@/components/anchor/AnchorConfirm";
import { StepLoading } from "@/components/questionnaire/StepLoading";
import { STORAGE_KEYS } from "@/config/storage";
import type { Venue, StopRole, ItineraryResponse } from "@/types";

type Step = "search" | "confirm" | "loading";

interface SearchResult {
  id: string;
  name: string;
  source: "catalog" | "google_places";
  google_place_id?: string;
}

export default function AnchorPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("search");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [vibeConfidence, setVibeConfidence] = useState<"high" | "low">("high");

  const handleSearchSelect = useCallback(async (result: SearchResult) => {
    if (result.source === "google_places" && result.google_place_id) {
      // Import provisional venue.
      const res = await fetch("/api/venue-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: result.google_place_id }),
      });
      const data = await res.json();
      if (!data.ok) return;
      setVenue(data.venue as Venue);
      setVibeConfidence(data.vibeConfidence ?? "low");
    } else {
      // Catalog venue — fetch full record.
      const res = await fetch(`/api/venue-search?q=${encodeURIComponent(result.name)}`);
      const searchData = await res.json();
      const match = searchData.results?.find(
        (r: { id: string }) => r.id === result.id
      );
      if (match) {
        setVenue(match as Venue);
      }
    }
    setStep("confirm");
  }, []);

  const handleConfirm = useCallback(
    async (config: {
      role: StopRole;
      fillRoles: StopRole[];
      startTime: string;
      vibe: string;
    }) => {
      if (!venue) return;
      setStep("loading");

      try {
        const body = {
          occasion: "friends",
          neighborhoods: [],
          budget: "no_preference",
          vibe: config.vibe,
          day: new Date().toISOString().split("T")[0],
          timeBlock: "evening",
          anchorVenueId: venue.id,
          anchorRole: config.role,
          fillRoles: config.fillRoles,
        };

        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error();
        const data = (await res.json()) as ItineraryResponse;
        sessionStorage.setItem(
          STORAGE_KEYS.session.currentItinerary,
          JSON.stringify(data)
        );
        router.push("/itinerary");
      } catch {
        router.push("/itinerary");
      }
    },
    [venue, router]
  );

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      <div className="px-6 pt-6 max-w-lg w-full mx-auto">
        <Header rightSlot={
          <Link href="/" className="font-sans text-sm text-muted hover:text-charcoal transition-colors">&larr; Back</Link>
        } />
      </div>

      <div className="flex-1 px-6 max-w-lg w-full mx-auto mt-6">
        {step === "search" && (
          <>
            <h1 className="font-serif text-2xl text-charcoal mb-2">
              Pick your spot
            </h1>
            <p className="font-sans text-sm text-muted mb-6">
              We&apos;ll build the rest of the night around it.
            </p>
            <AnchorSearch onSelect={handleSearchSelect} />
          </>
        )}

        {step === "confirm" && venue && (
          <AnchorConfirm
            venue={venue}
            inferredVibe={venue.inferred_vibe ?? null}
            vibeConfidence={vibeConfidence}
            onConfirm={handleConfirm}
          />
        )}

        {step === "loading" && <StepLoading />}
      </div>
    </div>
  );
}
