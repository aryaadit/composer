"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { TextMessageShare } from "@/components/itinerary/TextMessageShare";
import { ItineraryResponse } from "@/types";

interface ActionBarProps {
  itinerary: ItineraryResponse;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

export function ActionBar({
  itinerary,
  onRegenerate,
  isRegenerating,
}: ActionBarProps) {
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
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
            className="text-charcoal hover:text-burgundy transition-colors inline-flex items-center gap-1"
          >
            Open in Maps
            <span aria-hidden className="text-muted">→</span>
          </a>

          {/* Right: Regenerate · New Night · Share */}
          <div className="flex items-center gap-3">
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
              New Night
            </a>
            <button
              onClick={() => setShareOpen(true)}
              aria-label="Share"
              className="text-charcoal hover:text-burgundy transition-colors ml-1"
            >
              <ShareIcon />
            </button>
          </div>
        </div>
      </motion.div>

      <TextMessageShare
        itinerary={itinerary}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
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
