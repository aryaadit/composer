"use client";

// Bottom action bar for the itinerary view. Phase 7 removed Save and
// Share — Save moved to the prominent LooksGoodCTA near the top, and
// Share moved into the post-save ConfirmModal's "Copy share link"
// action. ActionBar now hosts only the Maps handoff, which is a
// distinct navigation concern.

import { motion } from "motion/react";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import type { ItineraryResponse } from "@/types";

interface ActionBarProps {
  itinerary: ItineraryResponse;
}

export function ActionBar({ itinerary }: ActionBarProps) {
  const { trackEngagement } = useEngagement();

  const handleMapsClick = () => {
    trackEngagement("maps_opened", {
      surface: "multi_stop_cta",
      stop_count: itinerary.stops.length,
    });
  };

  return (
    <motion.div
      className="w-full max-w-lg mx-auto mt-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
    >
      <div className="flex items-center justify-center font-sans text-sm">
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
      </div>
    </motion.div>
  );
}
