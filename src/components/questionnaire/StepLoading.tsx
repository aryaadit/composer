"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import { neighborhoodLabel } from "@/config/neighborhoods";

interface StepLoadingProps {
  occasion?: string;
  neighborhoods?: string[];
  vibe?: string;
}

const NEIGHBORHOOD_MESSAGES = [
  (n: string) => `Scouting ${n}...`,
  (n: string) => `Walking through ${n}...`,
  (n: string) => `Finding the best spots in ${n}...`,
];

const VIBE_MESSAGES: Record<string, string[]> = {
  food_forward: ["Lining up the food...", "Finding the best tables..."],
  drinks_led: ["Finding cocktail spots...", "Checking the bar scene..."],
  activity_food: ["Looking for something fun...", "Finding the action..."],
};

const OCCASION_MESSAGES: Record<string, string[]> = {
  date: ["Setting the scene...", "Composing your night..."],
  friends: ["Getting the group sorted...", "Building a night out..."],
  solo: ["Curating your solo adventure...", "Building your night..."],
};

const GENERIC = [
  "Checking the weather...",
  "Almost there...",
  "Putting the finishing touches on...",
  "Composing your night...",
];

function buildMessages(props: StepLoadingProps): string[] {
  const pool: string[] = [];

  if (props.neighborhoods?.length) {
    const label = neighborhoodLabel(props.neighborhoods[0]);
    for (const fn of NEIGHBORHOOD_MESSAGES) pool.push(fn(label));
  }

  if (props.vibe && VIBE_MESSAGES[props.vibe]) {
    pool.push(...VIBE_MESSAGES[props.vibe]);
  }

  if (props.occasion && OCCASION_MESSAGES[props.occasion]) {
    pool.push(...OCCASION_MESSAGES[props.occasion]);
  }

  pool.push(...GENERIC);
  return pool;
}

export function StepLoading(props: StepLoadingProps) {
  const messages = useMemo(() => buildMessages(props), [props]);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    // Audit items 17 + 23: burgundy spinner (was charcoal) + larger
    // copy + same role=status / aria-live treatment as LuckyOverlay so
    // both compose loaders feel like the same screen family. The
    // visible message is the accessible name — no aria-label needed.
    <div className="flex flex-1 flex-col items-center justify-center px-6 min-h-[60vh] bg-cream">
      <motion.div
        className="w-12 h-12 rounded-full border-2 border-burgundy border-t-transparent mb-8"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        aria-hidden
      />

      <AnimatePresence mode="wait">
        <motion.p
          key={msgIndex}
          role="status"
          aria-live="polite"
          className="font-serif text-xl text-charcoal text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {messages[msgIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
