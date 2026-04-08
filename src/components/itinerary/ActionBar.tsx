"use client";

import { motion } from "motion/react";
import Button from "@/components/ui/Button";
import { ItineraryResponse } from "@/types";
import { buildShareUrl, saveItinerary } from "@/lib/sharing";

interface ActionBarProps {
  itinerary: ItineraryResponse;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

export default function ActionBar({
  itinerary,
  onRegenerate,
  isRegenerating,
}: ActionBarProps) {
  const handleShare = async () => {
    const url = buildShareUrl(itinerary.inputs);
    try {
      await navigator.clipboard.writeText(url);
      alert("Share link copied to clipboard!");
    } catch {
      // Fallback
      prompt("Copy this link:", url);
    }
  };

  const handleSave = () => {
    saveItinerary(itinerary);
    alert("Itinerary saved!");
  };

  return (
    <motion.div
      className="flex flex-wrap items-center justify-center gap-3 mt-10 mb-16"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.6 }}
    >
      <Button
        variant="primary"
        onClick={() => window.open(itinerary.maps_url, "_blank")}
      >
        Open in Maps
      </Button>

      <Button variant="secondary" onClick={handleShare}>
        Share
      </Button>

      <Button
        variant="secondary"
        onClick={onRegenerate}
        disabled={isRegenerating}
      >
        {isRegenerating ? "Regenerating..." : "Regenerate"}
      </Button>

      <Button variant="secondary" onClick={handleSave}>
        Save
      </Button>
    </motion.div>
  );
}
