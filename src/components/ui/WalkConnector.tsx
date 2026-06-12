"use client";

import { motion } from "motion/react";

interface WalkConnectorProps {
  walkMinutes: number;
  index: number;
  /** Render variant — "default" is the standard centered text; "wavy"
   *  flanks the text with a hand-drawn-style burgundy wave on each
   *  side, used on lucky itineraries as a layer touch below the
   *  crown. Decorative only; the map's route polyline is real data
   *  and stays untouched in both variants. */
  variant?: "default" | "wavy";
}

export function WalkConnector({
  walkMinutes,
  index,
  variant = "default",
}: WalkConnectorProps) {
  if (variant === "wavy") {
    return (
      <motion.div
        data-testid="walk-connector-wavy"
        className="flex items-center gap-3 px-5 py-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: index * 0.15 + 0.1 }}
      >
        <WavyRule />
        <span className="font-sans text-xs text-muted whitespace-nowrap">
          {walkMinutes} min walk
        </span>
        <WavyRule />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-center gap-2 py-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: index * 0.15 + 0.1 }}
    >
      <span className="font-sans text-xs text-muted whitespace-nowrap">
        {walkMinutes} min walk
      </span>
    </motion.div>
  );
}

// Repeating quadratic-Bezier wave (Q + smooth T continuations) that
// stretches horizontally via preserveAspectRatio="none". Burgundy at
// /30 alpha so the visual weight reads similar to the standard
// border-border rule — present, not loud. No animation: static
// treatment so reduced-motion needs no branch.
function WavyRule() {
  return (
    <svg
      aria-hidden
      className="flex-1 h-2 text-burgundy/30"
      viewBox="0 0 80 8"
      preserveAspectRatio="none"
    >
      <path
        d="M0 4 Q5 0 10 4 T20 4 T30 4 T40 4 T50 4 T60 4 T70 4 T80 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
