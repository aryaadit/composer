"use client";

// Confirm screen after picking a venue. Time, role, and fill options.
// Low-confidence vibe inference shows a confirmation chip row.

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { pillClass } from "@/lib/styles";
import type { Venue, StopRole } from "@/types";

const FILL_OPTIONS = [
  { id: "before", label: "Just a drink before", roles: ["opener"] },
  { id: "after", label: "Just a nightcap after", roles: ["closer"] },
  { id: "both", label: "Both", roles: ["opener", "closer"] },
] as const;

const VIBES = [
  { id: "food_forward", label: "Food Forward" },
  { id: "drinks_led", label: "Drinks Led" },
  { id: "activity_food", label: "Activity + Food" },
  { id: "walk_explore", label: "Walk & Explore" },
  { id: "mix_it_up", label: "Mix It Up" },
] as const;

interface Props {
  venue: Venue;
  inferredVibe: string | null;
  vibeConfidence: "high" | "low";
  onConfirm: (config: {
    role: StopRole;
    fillRoles: StopRole[];
    startTime: string;
    vibe: string;
  }) => void;
}

export function AnchorConfirm({
  venue,
  inferredVibe,
  vibeConfidence,
  onConfirm,
}: Props) {
  const [startTime, setStartTime] = useState("19:00");
  const [role] = useState<StopRole>("main");
  const [fill, setFill] = useState<"before" | "after" | "both">("both");
  const [vibe, setVibe] = useState(inferredVibe ?? "food_forward");
  const needsVibeConfirm = vibeConfidence === "low" || !inferredVibe;

  const fillRoles = [...(FILL_OPTIONS.find((f) => f.id === fill)?.roles ?? ["opener", "closer"])];

  return (
    <div>
      <h2 className="font-serif text-2xl text-charcoal mb-1">{venue.name}</h2>
      <p className="font-sans text-sm text-muted mb-6">
        Build a night around this spot.
      </p>

      {/* Time */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
        What time
      </h3>
      <input
        type="time"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        className="w-full px-4 py-3 bg-white border border-border rounded-xl font-sans text-sm text-charcoal mb-6"
      />

      {/* Fill */}
      <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
        What around it
      </h3>
      <div className="flex flex-wrap gap-2 mb-6">
        {FILL_OPTIONS.map((opt) => (
          <motion.button
            key={opt.id}
            onClick={() => setFill(opt.id)}
            className={pillClass(fill === opt.id)}
            whileTap={{ scale: 0.97 }}
          >
            {opt.label}
          </motion.button>
        ))}
      </div>

      {/* Vibe confirmation (low confidence only) */}
      {needsVibeConfirm && (
        <>
          <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-2">
            What vibe
          </h3>
          <div className="flex flex-wrap gap-2 mb-6">
            {VIBES.map((v) => (
              <motion.button
                key={v.id}
                onClick={() => setVibe(v.id)}
                className={pillClass(vibe === v.id)}
                whileTap={{ scale: 0.97 }}
              >
                {v.label}
              </motion.button>
            ))}
          </div>
        </>
      )}

      <Button
        variant="primary"
        onClick={() => onConfirm({
          role,
          fillRoles: fillRoles as StopRole[],
          startTime,
          vibe,
        })}
        className="w-full"
      >
        Build my night →
      </Button>
    </div>
  );
}
