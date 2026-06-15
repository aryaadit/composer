"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import { EVENTS } from "@/lib/analytics";
import { StopCard } from "@/components/ui/StopCard";
import { getStopEyebrowLabel } from "@/lib/format/stop-eyebrow";
import { WalkConnector } from "@/components/ui/WalkConnector";
import { VenueDetailModal } from "@/components/venue/VenueDetailModal";
import { ItineraryMap } from "./ItineraryMap";
import { StopAvailabilitySection } from "./StopAvailability";
import {
  OrderingConflictBanner,
  detectOrderingConflict,
} from "./OrderingConflictBanner";
import { ComposeFailureBlock } from "./ComposeFailureBlock";
import type { ComposeFailure } from "@/lib/itinerary/compose-failure";
import type { AvailabilitySlot } from "@/lib/availability/resy";

const HIGHLIGHT_DURATION_MS = 1500;

export type ItinerarySurface = "fresh_itinerary" | "saved" | "share";

interface ItineraryViewProps {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
  date?: string;
  partySize?: number;
  /** User-chosen compose start time as HH:MM. Threaded into
   * StopAvailability so slot recommendations anchor to the actual
   * start (Phase 2 replaced the categorical "evening" hardcode). */
  startTime?: string;
  onAddStop?: () => void;
  isAddingStop?: boolean;
  /** Structured 422 failure from the last add-stop attempt. When present:
   *  the add-stop button hides (the pool is exhausted) and a
   *  ComposeFailureBlock renders inline where the button was. */
  addStopFailure?: ComposeFailure | null;
  onSwapStop?: (index: number) => void;
  swappingIndex?: number | null;
  /** Structured 422 failure from the last swap attempt — discriminated
   *  by stop index. StopCard renders the failure block + suppresses its
   *  Swap affordance when its index matches. */
  swapFailure?: { index: number; failure: ComposeFailure } | null;
  /** Index of the stop that JUST swapped — drives the inline
   *  "Swapped · Undo" affordance on its StopCard (replaces the
   *  deleted Toast pattern; audit item 19). */
  swappedIndex?: number | null;
  onUndoSwap?: () => void;
  /** When true: hide per-stop availability sections, hide swap, hide
   * reservation CTAs in StopCard, and replace add-stop with a
   * "Plan another →" CTA pointing at /compose. */
  isPast?: boolean;
  /** Surface this view is mounted on. Threaded into analytics events
   * (venue_detail_opened, reservation_clicked) so we can segment
   * engagement by where the user encountered the itinerary. */
  surface?: ItinerarySurface;
  /** Lucky-layer touches that survive below the seam. Today: the
   *  WalkConnector switches to its wavy variant. The banner + title
   *  die + crown band live ABOVE the seam, owned by LuckyCrown.
   *  Standard + daily itineraries render exactly as before when
   *  this is false / omitted. Computed at the consumer page from
   *  isLuckyItinerary(itinerary.inputs). */
  isLucky?: boolean;
  /** Page-level swap-anchor registrar. Forwarded verbatim to each
   *  StopCard so the page's SwapReasonModal can read its action-slot
   *  element for desktop-popover anchoring. */
  registerSwapAnchor?: (index: number, el: HTMLElement | null) => void;
}

/** Stable per-stop wrapper, keyed by INDEX at the call site (via the
 *  surrounding Fragment), so it does NOT unmount when the inner
 *  StopCard re-keys by venue.id on a swap. Floating-ui anchors the
 *  desktop swap-reason popover to this element; if the anchor lived
 *  inside the venue.id-keyed subtree (the previous attempt), the
 *  swap-driven remount would detach it and getBoundingClientRect
 *  would return all zeros — floating-ui then pins at (0, 0). The
 *  wrapper carries no className so it doesn't change the visual
 *  rhythm of the timeline; it's purely a positional anchor. */
function StopSlot({
  index,
  registerSwapAnchor,
  children,
}: {
  index: number;
  registerSwapAnchor?: (index: number, el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  // Stable ref callback per slot. useCallback's identity only changes
  // when index or registerSwapAnchor change — both stable for a given
  // mounted slot — so React doesn't churn the ref between renders.
  const setRef = useCallback(
    (el: HTMLElement | null) => registerSwapAnchor?.(index, el),
    [index, registerSwapAnchor],
  );
  return <div ref={setRef}>{children}</div>;
}

export function ItineraryView({
  stops,
  walks,
  date = "",
  partySize = 2,
  startTime = "19:00",
  onAddStop,
  isAddingStop = false,
  addStopFailure,
  onSwapStop,
  swappingIndex,
  swapFailure,
  swappedIndex,
  onUndoSwap,
  isPast = false,
  surface = "fresh_itinerary",
  isLucky = false,
  registerSwapAnchor,
}: ItineraryViewProps) {
  const { trackEngagement, incrementEngagement } = useEngagement();

  // Server-initiated engagements (stop_swapped via trackServer; stop_added
  // via its server route then a client-side track on success) — bump the
  // engagement counter at the CLIENT INITIATION point, not after the
  // server resolves. Failed server calls still count: the user expressed
  // intent. stop_added's success-side track() stays as a raw call to
  // avoid double-counting (incrementEngagement here already bumped).
  const wrappedOnSwapStop = onSwapStop
    ? (index: number) => {
        incrementEngagement();
        onSwapStop(index);
      }
    : undefined;
  const wrappedOnAddStop = onAddStop
    ? () => {
        incrementEngagement();
        onAddStop();
      }
    : undefined;

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
    trackEngagement(EVENTS.VENUE_DETAIL_OPENED, {
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
        walks={walks}
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
      {/* Audit item 28: hardcoded #D8D8D8 replaced with the border
          token (#E8E8E8). Slight visible delta — the rule reads a
          touch lighter — but it stays inside the design-system
          tolerance and the rule renders on every itinerary surface. */}
      <div className="w-full max-w-lg mx-auto border-y border-border divide-y divide-border">
        {stops.map((stop, i) => (
          // Fragment is keyed by stop INDEX so the slot (and its
          // StopSlot wrapper) stays mounted across swaps — even when
          // the inner StopCard re-keys by venue.id. The previous
          // `key={stop.venue.id}` here is what caused floating-ui to
          // anchor to a detached DOM node after every swap.
          <Fragment key={`stop-slot-${i}`}>
            <StopSlot index={i} registerSwapAnchor={registerSwapAnchor}>
              <StopCard
                // venue.id key preserved on the StopCard itself so the
                // card body still remounts on swap — keeps the
                // entrance animation and the slot-grid availability
                // section fresh exactly as before.
                key={stop.venue.id}
                stop={stop}
                index={i}
                eyebrowLabel={getStopEyebrowLabel(stop, i, stops)}
                date={date}
                partySize={partySize}
                onSwap={
                  !isPast &&
                  wrappedOnSwapStop &&
                  swapFailure?.index !== i
                    ? () => wrappedOnSwapStop(i)
                    : undefined
                }
                onVenueTap={() => handleVenueTap(i)}
                isSwapping={swappingIndex === i}
                swapFailure={
                  swapFailure?.index === i ? swapFailure.failure : null
                }
                justSwapped={swappedIndex === i}
                onUndoSwap={onUndoSwap}
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
                    stopIndex={i}
                    startTime={startTime}
                    selectedSlot={selectedSlots[stop.venue.id] ?? null}
                    onSelectSlot={(slot) =>
                      handleSelectSlot(stop.venue.id, slot)
                    }
                  />
                </div>
              )}
            </StopSlot>
            {i < stops.length - 1 && walks[i] && (
              <WalkConnector
                walkMinutes={walks[i].walk_minutes}
                index={i}
                variant={isLucky ? "wavy" : "default"}
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
        ) : addStopFailure ? (
          // Add-stop exhausted: replace the affordance entirely with the
          // failure block. Inviting retries against a dead pool is
          // dishonest, so the button is gone — not just disabled.
          <motion.div
            className="py-6 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ComposeFailureBlock failure={addStopFailure} />
          </motion.div>
        ) : (
          wrappedOnAddStop && (
            <motion.div
              className="py-6 flex justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            >
              <button
                onClick={wrappedOnAddStop}
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
        stopIndex={detailIndex ?? undefined}
        onClose={() => setDetailIndex(null)}
      />
    </>
  );
}
