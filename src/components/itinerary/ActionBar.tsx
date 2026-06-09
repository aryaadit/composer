"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useAuth } from "@/components/providers/AuthProvider";
import { incrementPersonProperty, track } from "@/lib/analytics";
import type { ItineraryResponse } from "@/types";

interface ActionBarProps {
  itinerary: ItineraryResponse;
  onRegenerate: () => void;
  isRegenerating: boolean;
  initialSaved?: boolean;
}

export function ActionBar({
  itinerary,
  onRegenerate,
  isRegenerating,
  initialSaved = false,
}: ActionBarProps) {
  const { user } = useAuth();
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    initialSaved ? "saved" : "idle"
  );
  const [shareState, setShareState] = useState<"idle" | "sharing" | "copied" | "error">("idle");

  const handleSave = async () => {
    if (saveState === "saving" || saveState === "saved") return;
    if (!user) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
      return;
    }
    setSaveState("saving");

    const { inputs, header, stops, walking } = itinerary;
    const { data, error } = await getBrowserSupabase()
      .from("composer_saved_itineraries")
      .insert({
        user_id: user.id,
        title: header.title,
        subtitle: header.subtitle,
        occasion: inputs.occasion,
        neighborhoods: inputs.neighborhoods,
        budget: inputs.budget,
        vibe: inputs.vibe,
        day: inputs.day,
        // time_block is a legacy NOT-NULL column. Phase 1 saves no
        // longer carry a categorical block — write "evening" so the
        // constraint holds. The saved view derives startTime via
        // startTimeFromLegacyBlock for old rows; new rows have
        // startTime baked into inputs via the stops snapshot.
        time_block: "evening",
        stops,
        walking,
        weather: header.weather,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[itinerary] save failed:", error.message);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2500);
      return;
    }
    track("itinerary_saved", {
      itinerary_id: (data as { id: string } | null)?.id ?? null,
      occasion: inputs.occasion,
      neighborhoods: inputs.neighborhoods,
      budget: inputs.budget,
      vibe: inputs.vibe,
      start_time: inputs.startTime,
      stop_count: stops.length,
    });
    incrementPersonProperty("total_itineraries_saved", 1);
    setSaveState("saved");
  };

  const handleShare = async () => {
    if (shareState === "sharing" || shareState === "copied") return;
    setShareState("sharing");

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itinerary),
      });
      if (!res.ok) throw new Error("share failed");
      const { id, url } = (await res.json()) as { id: string; url: string };

      await navigator.clipboard.writeText(url);
      track("share_link_copied", {
        itinerary_id: id,
        share_method: "button_click",
      });
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 3000);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2500);
    }
  };

  const handleMapsClick = () => {
    track("maps_opened", {
      surface: "multi_stop_cta",
      stop_count: itinerary.stops.length,
    });
  };

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved"
      ? "Saved"
      : saveState === "error"
      ? "Try again"
      : "Save";

  const shareLabel =
    shareState === "sharing"
      ? "…"
      : shareState === "copied"
      ? "Link copied"
      : shareState === "error"
      ? "Try again"
      : null; // null = show icon

  return (
    <motion.div
      className="w-full max-w-lg mx-auto mt-10 pt-4 border-t border-border"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <div className="flex items-center justify-between font-sans text-sm">
        {/* Left: Maps link */}
        <a
          href={itinerary.maps_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleMapsClick}
          className="text-charcoal hover:text-burgundy transition-colors inline-flex items-center gap-1"
        >
          Open in Maps
          <span aria-hidden className="text-muted">→</span>
        </a>

        {/* Right: Save · Regenerate · New plan · Share */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => void handleSave()}
            disabled={saveState === "saving" || saveState === "saved"}
            className="text-charcoal hover:text-burgundy transition-colors disabled:text-muted"
          >
            {saveLabel}
          </button>
          <span aria-hidden className="text-muted">·</span>
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="text-charcoal hover:text-burgundy transition-colors disabled:opacity-50"
          >
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
          <span aria-hidden className="text-muted">·</span>
          <a
            href="/compose"
            className="text-charcoal hover:text-burgundy transition-colors"
          >
            New plan
          </a>
          <button
            onClick={() => void handleShare()}
            disabled={shareState === "sharing"}
            className="text-charcoal hover:text-burgundy transition-colors ml-1 inline-flex items-center gap-1"
          >
            <ShareIcon />
            <span>{shareLabel ?? "Share"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v13" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}
