"use client";

// Sticky bottom CTA replacing the old bottom Save+Share. Phase 7
// introduced it inline; Phase 8 moves it to a fixed-position bar at
// the viewport bottom so it stays in view while the user scrolls
// through stops.
//
// Pre-save:  "Looks Good →" — burgundy fill, primary treatment.
//            Tap fires save (optimistic visual transition), opens
//            ConfirmModal on save success. Reverts on failure.
// Post-save: "Saved ✓ ▼" — burgundy outlined (lighter weight) so
//            it reads as completed without going away. Tap opens
//            ConfirmModal directly.
//
// Share URL is prefetched in this component (one fetch per CTA
// lifecycle, dedupe via inflight ref) and passed down to ConfirmModal
// so the calendar event description can embed the share link.

import { useCallback, useRef, useState } from "react";
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

  // Share-URL state — prefetched after save (or on first modal open
  // for the initial-saved surface). One fetch per CTA lifecycle; the
  // inflight ref dedupes concurrent callers (e.g. modal mount races
  // with the post-save kickoff).
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareInflightRef = useRef<Promise<string | null> | null>(null);

  const ensureShareUrl = useCallback(async (): Promise<string | null> => {
    if (shareUrl) return shareUrl;
    if (shareInflightRef.current) return shareInflightRef.current;
    const promise = fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(itinerary),
    })
      .then(async (res) => {
        if (!res.ok) {
          shareInflightRef.current = null;
          return null;
        }
        const payload = (await res.json()) as { id: string; url: string };
        setShareUrl(payload.url);
        shareInflightRef.current = null;
        return payload.url;
      })
      .catch(() => {
        shareInflightRef.current = null;
        return null;
      });
    shareInflightRef.current = promise;
    return promise;
  }, [shareUrl, itinerary]);

  const handleClick = async () => {
    if (saveState === "saving") return;

    // Post-save: id already known, just open the modal. Kick off the
    // share-URL prefetch in the background if we don't have it yet.
    if (savedItineraryId !== null) {
      void ensureShareUrl();
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
      // Prefetch share URL in parallel with modal open — the rich
      // description footer needs it.
      void ensureShareUrl();
      setModalOpen(true);
    } catch (err) {
      console.error("[looks-good] save failed:", err);
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
    <>
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-cream/95 backdrop-blur-sm border-t border-border"
        data-testid="looks-good-sticky"
      >
        <div className="w-full max-w-lg mx-auto px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => void handleClick()}
            disabled={saveState === "saving"}
            className={`w-full px-6 py-4 rounded-full font-sans text-base font-medium transition-colors ${
              isPostSave
                ? "bg-transparent border border-burgundy text-burgundy hover:bg-burgundy/5"
                : "bg-burgundy text-cream hover:bg-burgundy-light"
            } disabled:opacity-70`}
          >
            {label}
          </button>
        </div>
      </div>

      {savedItineraryId !== null && (
        <ConfirmModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          itinerary={itinerary}
          savedItineraryId={savedItineraryId}
          surface={surface}
          shareUrl={shareUrl}
          ensureShareUrl={ensureShareUrl}
        />
      )}
    </>
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
