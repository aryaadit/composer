"use client";

import { Fragment } from "react";
import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { StopCard } from "@/components/ui/StopCard";
import { WalkConnector } from "@/components/ui/WalkConnector";

interface ItineraryViewProps {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
  onAddStop?: () => void;
  isAddingStop?: boolean;
  onSwapStop?: (index: number) => void;
  onVenueTap?: (index: number) => void;
  swappingIndex?: number | null;
  swapError?: { index: number; message: string } | null;
}

export function ItineraryView({
  stops,
  walks,
  onAddStop,
  isAddingStop = false,
  onSwapStop,
  onVenueTap,
  swappingIndex,
  swapError,
}: ItineraryViewProps) {
  return (
    <div className="w-full max-w-lg mx-auto border-y border-[#D8D8D8] divide-y divide-[#D8D8D8]">
      {stops.map((stop, i) => (
        <Fragment key={stop.venue.id}>
          <StopCard
            stop={stop}
            index={i}
            onSwap={onSwapStop ? () => onSwapStop(i) : undefined}
            onVenueTap={onVenueTap ? () => onVenueTap(i) : undefined}
            isSwapping={swappingIndex === i}
            swapError={swapError?.index === i ? swapError.message : null}
          />
          {i < stops.length - 1 && walks[i] && (
            <WalkConnector
              walkMinutes={walks[i].walk_minutes}
              index={i}
              mapUrl={walks[i].map_url}
            />
          )}
        </Fragment>
      ))}
      {onAddStop && (
        <motion.div
          className="py-6 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <button
            onClick={onAddStop}
            disabled={isAddingStop}
            className="inline-flex items-center gap-2 rounded-full border border-dashed border-burgundy/50 px-5 py-2.5 font-sans text-sm text-burgundy hover:bg-burgundy/5 hover:border-burgundy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAddingStop ? "Finding another spot…" : "+ Add another stop"}
          </button>
        </motion.div>
      )}
    </div>
  );
}
