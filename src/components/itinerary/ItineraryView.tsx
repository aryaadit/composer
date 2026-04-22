"use client";

import { Fragment, useState } from "react";
import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { StopCard } from "@/components/ui/StopCard";
import { WalkConnector } from "@/components/ui/WalkConnector";
import { VenueDetailModal } from "@/components/venue/VenueDetailModal";
import { StopAvailabilitySection } from "./StopAvailability";
import {
  OrderingConflictBanner,
  detectOrderingConflict,
} from "./OrderingConflictBanner";
import type { AvailabilitySlot } from "@/lib/availability/resy";
import type { TimeBlock } from "@/lib/itinerary/time-blocks";

interface ItineraryViewProps {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
  timeBlock?: TimeBlock;
  date?: string;
  partySize?: number;
  onAddStop?: () => void;
  isAddingStop?: boolean;
  onSwapStop?: (index: number) => void;
  swappingIndex?: number | null;
  swapError?: { index: number; message: string } | null;
}

export function ItineraryView({
  stops,
  walks,
  timeBlock = "evening",
  date = "",
  partySize = 2,
  onAddStop,
  isAddingStop = false,
  onSwapStop,
  swappingIndex,
  swapError,
}: ItineraryViewProps) {
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const detailVenue =
    detailIndex !== null ? stops[detailIndex]?.venue ?? null : null;

  // Slot selection state — ephemeral, not persisted
  const [selectedSlots, setSelectedSlots] = useState<
    Record<string, AvailabilitySlot>
  >({});
  const [conflictDismissed, setConflictDismissed] = useState(false);

  const handleSelectSlot = (
    venueId: string,
    slot: AvailabilitySlot | null
  ) => {
    setSelectedSlots((prev) => {
      const next = { ...prev };
      if (slot) {
        next[venueId] = slot;
      } else {
        delete next[venueId];
      }
      return next;
    });
    setConflictDismissed(false);
  };

  const conflict = detectOrderingConflict(stops, selectedSlots);

  const handleSwapConflict = () => {
    if (!conflict) return;
    const stopA = stops[conflict.earlierStopIndex];
    const stopB = stops[conflict.laterStopIndex];
    const slotA = selectedSlots[stopA.venue.id];
    const slotB = selectedSlots[stopB.venue.id];
    if (slotA && slotB) {
      setSelectedSlots((prev) => ({
        ...prev,
        [stopA.venue.id]: slotB,
        [stopB.venue.id]: slotA,
      }));
    }
  };

  return (
    <>
      {conflict && !conflictDismissed && (
        <OrderingConflictBanner
          conflict={conflict}
          onSwap={handleSwapConflict}
          onDismiss={() => setConflictDismissed(true)}
        />
      )}
      <div className="w-full max-w-lg mx-auto border-y border-[#D8D8D8] divide-y divide-[#D8D8D8]">
        {stops.map((stop, i) => (
          <Fragment key={stop.venue.id}>
            <div>
              <StopCard
                stop={stop}
                index={i}
                onSwap={onSwapStop ? () => onSwapStop(i) : undefined}
                onVenueTap={() => setDetailIndex(i)}
                isSwapping={swappingIndex === i}
                swapError={swapError?.index === i ? swapError.message : null}
              />
              {stop.availability && (
                <div className="px-0 pb-6">
                  <StopAvailabilitySection
                    availability={stop.availability}
                    role={stop.role}
                    timeBlock={timeBlock}
                    platform={stop.venue.reservation_platform}
                    venueName={stop.venue.name}
                    venueSlug={stop.venue.resy_slug}
                    venueResyId={stop.venue.resy_venue_id}
                    date={date}
                    partySize={partySize}
                    selectedSlot={selectedSlots[stop.venue.id] ?? null}
                    onSelectSlot={(slot) =>
                      handleSelectSlot(stop.venue.id, slot)
                    }
                  />
                </div>
              )}
            </div>
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
      <VenueDetailModal
        venue={detailVenue}
        onClose={() => setDetailIndex(null)}
      />
    </>
  );
}
