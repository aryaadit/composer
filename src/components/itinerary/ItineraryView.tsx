"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { track } from "@/lib/analytics";
import { StopCard } from "@/components/ui/StopCard";
import { WalkConnector } from "@/components/ui/WalkConnector";
import { VenueDetailModal } from "@/components/venue/VenueDetailModal";
import { ItineraryMap } from "./ItineraryMap";
import { StopAvailabilitySection } from "./StopAvailability";
import {
  OrderingConflictBanner,
  detectOrderingConflict,
} from "./OrderingConflictBanner";
import type { AvailabilitySlot } from "@/lib/availability/resy";

const HIGHLIGHT_DURATION_MS = 1500;

export type ItinerarySurface = "fresh_itinerary" | "saved" | "share";

interface ItineraryViewProps {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
  date?: string;
  partySize?: number;
  onAddStop?: () => void;
  isAddingStop?: boolean;
  onSwapStop?: (index: number) => void;
  swappingIndex?: number | null;
  swapError?: { index: number; message: string } | null;
  /** When true: hide per-stop availability sections, hide swap, hide
   * reservation CTAs in StopCard, and replace add-stop with a
   * "Plan another →" CTA pointing at /compose. */
  isPast?: boolean;
  /** Surface this view is mounted on. Threaded into analytics events
   * (venue_detail_opened, reservation_clicked) so we can segment
   * engagement by where the user encountered the itinerary. */
  surface?: ItinerarySurface;
}

export function ItineraryView({
  stops,
  walks,
  date = "",
  partySize = 2,
  onAddStop,
  isAddingStop = false,
  onSwapStop,
  swappingIndex,
  swapError,
  isPast = false,
  surface = "fresh_itinerary",
}: ItineraryViewProps) {
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const detailVenue =
    detailIndex !== null ? stops[detailIndex]?.venue ?? null : null;
  const detailRole =
    detailIndex !== null ? stops[detailIndex]?.role ?? null : null;

  // Slot selection state — ephemeral, not persisted
  const [selectedSlots, setSelectedSlots] = useState<
    Record<string, AvailabilitySlot>
  >({});
  const [conflictDismissed, setConflictDismissed] = useState(false);

  // Pin-tap highlight: set by ItineraryMap when the user taps a pin,
  // passed into the matching StopCard for a transient ring pulse,
  // cleared after HIGHLIGHT_DURATION_MS so the visual is brief.
  const [highlightedStopIndex, setHighlightedStopIndex] = useState<
    number | null
  >(null);
  useEffect(() => {
    if (highlightedStopIndex === null) return;
    const t = setTimeout(() => setHighlightedStopIndex(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(t);
  }, [highlightedStopIndex]);

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

  const handleVenueTap = (i: number) => {
    const stop = stops[i];
    track("venue_detail_opened", {
      venue_id: stop.venue.id,
      venue_name: stop.venue.name,
      stop_role: stop.role,
      from_surface: surface,
    });
    setDetailIndex(i);
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
      <ItineraryMap
        stops={stops}
        surface={surface}
        onHighlightStop={setHighlightedStopIndex}
      />
      {!isPast && conflict && !conflictDismissed && (
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
                date={date}
                partySize={partySize}
                onSwap={!isPast && onSwapStop ? () => onSwapStop(i) : undefined}
                onVenueTap={() => handleVenueTap(i)}
                isSwapping={swappingIndex === i}
                swapError={swapError?.index === i ? swapError.message : null}
                isPast={isPast}
                highlighted={highlightedStopIndex === i}
              />
              {!isPast && stop.availability && (
                <div className="px-0 pb-6">
                  <StopAvailabilitySection
                    availability={stop.availability}
                    role={stop.role}
                    platform={stop.venue.reservation_platform}
                    venueId={stop.venue.id}
                    venueName={stop.venue.name}
                    venueSlug={stop.venue.resy_slug}
                    venueResyId={stop.venue.resy_venue_id}
                    date={date}
                    partySize={partySize}
                    selectedSlot={selectedSlots[stop.venue.id] ?? null}
                    onSelectSlot={(slot) =>
                      handleSelectSlot(stop.venue.id, slot)
                    }
                    onSwap={onSwapStop ? () => onSwapStop(i) : undefined}
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
        {isPast ? (
          <motion.div
            className="py-6 flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
          >
            <Link
              href="/compose"
              className="inline-flex items-center gap-2 rounded-full border border-dashed border-burgundy/50 px-5 py-2.5 font-sans text-sm text-burgundy hover:bg-burgundy/5 hover:border-burgundy transition-colors"
            >
              Plan another →
            </Link>
          </motion.div>
        ) : (
          onAddStop && (
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
          )
        )}
      </div>
      <VenueDetailModal
        venue={detailVenue}
        stopRole={detailRole}
        onClose={() => setDetailIndex(null)}
      />
    </>
  );
}
