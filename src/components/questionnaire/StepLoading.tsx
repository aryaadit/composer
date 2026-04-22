"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import { neighborhoodLabel } from "@/config/neighborhoods";

interface StepLoadingProps {
  occasion?: string;
  neighborhoods?: string[];
  vibe?: string;
  timeBlocks?: string[];
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
  walk_explore: ["Mapping a good route...", "Finding hidden gems..."],
  mix_it_up: ["Mixing it up...", "Pulling together a little of everything..."],
};

const OCCASION_MESSAGES: Record<string, string[]> = {
  dating: ["Planning your date night...", "Setting the mood..."],
  relationship: ["Planning a night to remember...", "Making it special..."],
  friends: ["Getting the group sorted...", "Building a night out..."],
  family: ["Finding something for everyone...", "Planning family time..."],
  solo: ["Curating your solo adventure...", "Building your night..."],
  first_date: ["Making this first impression count...", "Setting the scene..."],
  couple: ["Planning a surprise...", "Building your evening..."],
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
    <div className="flex flex-1 flex-col items-center justify-center px-6 min-h-[60vh]">
      <motion.div
        className="w-10 h-10 rounded-full border-2 border-charcoal border-t-transparent mb-8"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />

      <AnimatePresence mode="wait">
        <motion.p
          key={msgIndex}
          className="font-sans text-base text-warm-gray text-center"
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
