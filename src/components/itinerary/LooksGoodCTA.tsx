"use client";

// Prominent post-Phase-7 CTA. Replaces the bottom Save + Share with a
// single "Looks Good →" button near the top of the fresh itinerary.
//
// Pre-save: button reads "Looks Good →". Tap fires save, transitions
//           button optimistically to "Saved ✓", opens ConfirmModal on
//           save success. On failure, reverts + shows toast.
// Post-save: button reads "Saved ✓ ▼". Tap opens ConfirmModal directly
//            (no re-save).
//
// Lives between CompositionHeader and ItineraryView on the fresh page.
// Not rendered on saved/share surfaces.

import { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import { incrementPersonProperty } from "@/lib/analytics";
import { saveItineraryToSupabase } from "@/lib/itinerary/save";
import { ConfirmModal } from "@/components/itinerary/ConfirmModal";
import type { ItineraryResponse } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";

interface LooksGoodCTAProps {
  itinerary: ItineraryResponse;
  /**
   * Pre-populated saved-itinerary id. When provided, the CTA renders
   * in "Saved ✓ ▼" state from mount — tapping opens the ConfirmModal
   * directly without re-saving. Used by the saved-page surface where
   * the itinerary already exists in the DB.
   */
  initialSavedId?: string | null;
  /**
   * Analytics surface the modal's calendar/share actions report under.
   * Defaults to "fresh_itinerary"; saved page passes "saved".
   */
  surface?: "fresh_itinerary" | "saved";
}

export function LooksGoodCTA({
  itinerary,
  initialSavedId = null,
  surface = "fresh_itinerary",
}: LooksGoodCTAProps) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEngagement } = useEngagement();

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedItineraryId, setSavedItineraryId] = useState<string | null>(
    initialSavedId,
  );
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = async () => {
    if (saveState === "saving") return;

    // Post-save: already have an id, just open the modal again.
    if (savedItineraryId !== null) {
      setModalOpen(true);
      return;
    }

    if (!user) {
      toast.show({ message: "Sign in to save", durationMs: 2500 });
      return;
    }

    // Optimistic visual: flip the button to "Saved ✓" immediately so
    // the user gets an instant response. The actual save fires in the
    // background; we revert on failure.
    setSaveState("saved");
    try {
      const id = await saveItineraryToSupabase(itinerary, user.id);
      setSavedItineraryId(id);
      trackEngagement("itinerary_saved", {
        itinerary_id: id,
        occasion: itinerary.inputs.occasion,
        neighborhoods: itinerary.inputs.neighborhoods,
        budget: itinerary.inputs.budget,
        vibe: itinerary.inputs.vibe,
        start_time: itinerary.inputs.startTime,
        stop_count: itinerary.stops.length,
      });
      incrementPersonProperty("total_itineraries_saved", 1);
      setModalOpen(true);
    } catch (err) {
      console.error("[looks-good] save failed:", err);
      // Revert the optimistic transition.
      setSaveState("error");
      toast.show({
        message: "Couldn't save — try again.",
        durationMs: 2500,
      });
      setTimeout(() => setSaveState("idle"), 2500);
    }
  };

  const isPostSave = savedItineraryId !== null;

  const label = isPostSave ? (
    <span className="inline-flex items-center gap-2">
      Saved <CheckIcon /> <ChevronDownIcon />
    </span>
  ) : saveState === "saved" ? (
    <span className="inline-flex items-center gap-2">
      Saving… <CheckIcon />
    </span>
  ) : saveState === "error" ? (
    "Try again"
  ) : (
    <span className="inline-flex items-center gap-2">
      Looks Good <span aria-hidden>→</span>
    </span>
  );

  return (
    <div className="w-full max-w-lg mx-auto mb-8 flex justify-center md:justify-start">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={saveState === "saving"}
        className={`w-full md:w-3/4 px-6 py-4 rounded-full font-sans text-base font-medium transition-colors ${
          isPostSave
            ? "bg-burgundy/90 text-cream hover:bg-burgundy"
            : "bg-burgundy text-cream hover:bg-burgundy-light"
        } disabled:opacity-70`}
      >
        {label}
      </button>

      {savedItineraryId !== null && (
        <ConfirmModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          itinerary={itinerary}
          savedItineraryId={savedItineraryId}
          surface={surface}
        />
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
