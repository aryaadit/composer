"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { ItineraryResponse, QuestionnaireAnswers } from "@/types";
import { decodeParamsToInputs } from "@/lib/sharing";
import CompositionHeader from "@/components/itinerary/CompositionHeader";
import ItineraryView from "@/components/itinerary/ItineraryView";
import ActionBar from "@/components/itinerary/ActionBar";
import StepLoading from "@/components/questionnaire/StepLoading";
import Button from "@/components/ui/Button";

function ItineraryContent() {
  const searchParams = useSearchParams();
  const [itinerary, setItinerary] = useState<ItineraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fetchItinerary = useCallback(async (inputs: QuestionnaireAnswers) => {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });

    if (!res.ok) throw new Error("Generation failed");
    return (await res.json()) as ItineraryResponse;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        // Check for share link params first
        const paramsInputs = decodeParamsToInputs(searchParams);
        if (paramsInputs) {
          const data = await fetchItinerary(paramsInputs);
          setItinerary(data);
          setLoading(false);
          return;
        }

        // Check sessionStorage
        const stored = sessionStorage.getItem("composer_itinerary");
        if (stored) {
          setItinerary(JSON.parse(stored));
          setLoading(false);
          return;
        }

        setError("No itinerary data found. Start from the beginning.");
        setLoading(false);
      } catch {
        setError("Something went wrong generating your night. Try again.");
        setLoading(false);
      }
    }
    load();
  }, [searchParams, fetchItinerary]);

  const handleRegenerate = async () => {
    if (!itinerary) return;
    setRegenerating(true);
    try {
      const data = await fetchItinerary(itinerary.inputs);
      setItinerary(data);
      sessionStorage.setItem("composer_itinerary", JSON.stringify(data));
    } catch {
      // Keep current itinerary on failure
    }
    setRegenerating(false);
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
    <main className="flex flex-1 flex-col items-center min-h-screen px-6 pt-12 pb-8">
      <CompositionHeader header={itinerary.header} />
      <ItineraryView stops={itinerary.stops} walks={itinerary.walks} />
      <ActionBar
        itinerary={itinerary}
        onRegenerate={handleRegenerate}
        isRegenerating={regenerating}
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
