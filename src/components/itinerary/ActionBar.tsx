"use client";

import { useState } from "react";
import { motion } from "motion/react";
import Button from "@/components/ui/Button";
import TextMessageShare from "@/components/itinerary/TextMessageShare";
import { ItineraryResponse } from "@/types";
import { saveItinerary } from "@/lib/sharing";

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
  const [shareOpen, setShareOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveItinerary(itinerary);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <motion.div
        className="flex flex-wrap items-center justify-center gap-3 mt-10 mb-16"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        <Button
          variant="primary"
          onClick={() => setShareOpen(true)}
        >
          Send the text
        </Button>

        <Button
          variant="secondary"
          onClick={() => window.open(itinerary.maps_url, "_blank")}
        >
          Open in Maps
        </Button>

        <Button
          variant="secondary"
          onClick={onRegenerate}
          disabled={isRegenerating}
        >
          {isRegenerating ? "Regenerating..." : "Regenerate"}
        </Button>

        <Button variant="secondary" onClick={handleSave} disabled={saved}>
          {saved ? "Saved ✓" : "Save"}
        </Button>

        <Button variant="secondary" href="/compose">
          New Night
        </Button>
      </motion.div>

      <TextMessageShare
        itinerary={itinerary}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
