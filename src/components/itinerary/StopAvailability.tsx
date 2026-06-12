"use client";

// Per-stop availability section. Renders one of four states:
// has_slots, walk_in, unconfirmed, no_slots_in_block.

import { useState } from "react";
import { SlotChip, dedupeSlots } from "./SlotChip";
import {
  pickRecommendedSlots,
  formatSlotTimeForDisplay,
} from "@/lib/itinerary/time-blocks";
import { buildResySlotBookingUrl } from "@/lib/availability/booking-url";
import { detectBookingPlatform } from "@/lib/booking";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import { EVENTS } from "@/lib/analytics";
import type {
  StopAvailability as StopAvailabilityType,
  StopRole,
} from "@/types";
import type { AvailabilitySlot } from "@/lib/availability/resy";

interface StopAvailabilityProps {
  availability: StopAvailabilityType;
  role: StopRole;
  platform: string | null;
  venueId: string;
  venueName: string;
  venueSlug: string | null;
  venueResyId: number | null;
  date: string;
  partySize: number;
  /** 0-based index of this stop in the itinerary. Drives the
   * pickRecommendedSlots center time (Phase 2 replaced the categorical
   * "evening" anchor with stop-index + startTime). */
  stopIndex: number;
  /** User-chosen start time as HH:MM. Combined with stopIndex to
   * compute the slot-recommendation center via getStopCenterTime. */
  startTime: string;
  selectedSlot: AvailabilitySlot | null;
  onSelectSlot: (slot: AvailabilitySlot | null) => void;
  /** Curation Swap action — when the slot grid is showing, Swap renders
   * here (under the times) so booking and curation actions are visually
   * separated. When undefined, Swap is hidden. */
  onSwap?: () => void;
}

const PLATFORM_NAMES: Record<string, string> = {
  resy: "Resy",
  opentable: "OpenTable",
  tock: "Tock",
  sevenrooms: "SevenRooms",
};

export function StopAvailabilitySection({
  availability,
  role,
  platform,
  venueId,
  venueName,
  venueSlug,
  venueResyId,
  date,
  partySize,
  stopIndex,
  startTime,
  selectedSlot,
  onSelectSlot,
  onSwap,
}: StopAvailabilityProps) {
  const { trackEngagement } = useEngagement();
  const { status, slots, bookingUrlBase } = availability;

  // Walk-in status is now shown in StopCard's meta line — no separate badge
  if (status === "walk_in") return null;

  if (status === "unconfirmed") {
    // Derive platform from the URL (not the DB field) so venues with a
    // null reservation_platform but an OpenTable URL still get the right
    // copy. Falls back to the platform prop / "the venue" when the URL
    // is missing.
    const detected = bookingUrlBase ? detectBookingPlatform(bookingUrlBase) : null;
    const detectedId = detected?.id;
    const trackedPlatform = detectedId ?? platform ?? "other";

    let copy: string;
    if (detectedId === "opentable") {
      copy = "OpenTable doesn't share live availability — book directly";
    } else if (detectedId === "resy") {
      copy = "Couldn't load times — check directly on Resy";
    } else if (detectedId === "tock") {
      copy = "Couldn't load times — check directly on Tock";
    } else {
      const name = PLATFORM_NAMES[platform ?? ""] ?? "the venue";
      copy = `Couldn't load times — check directly on ${name}`;
    }

    return (
      <div className="mt-3 space-y-2">
        <p className="font-sans text-xs text-muted italic">{copy}</p>
        {bookingUrlBase && (
          <a
            href={bookingUrlBase}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEngagement(EVENTS.RESERVATION_CLICKED, {
                venue_id: venueId,
                venue_name: venueName,
                platform: trackedPlatform,
                stop_index: stopIndex,
                stop_role: role,
                from_surface: "availability_unconfirmed",
              })
            }
            className="inline-block font-sans text-sm text-burgundy hover:text-burgundy-light transition-colors"
          >
            Check availability →
          </a>
        )}
      </div>
    );
  }

  if (status === "no_slots_in_block") {
    return (
      <div className="mt-3 space-y-2">
        <p className="font-sans text-xs text-muted italic">
          No tables available in your time block
        </p>
        {bookingUrlBase && (
          <a
            href={bookingUrlBase}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEngagement(EVENTS.RESERVATION_CLICKED, {
                venue_id: venueId,
                venue_name: venueName,
                platform: platform ?? "other",
                stop_index: stopIndex,
                stop_role: role,
                has_slot: false,
                from_surface: "availability_no_slots",
              })
            }
            className="inline-block font-sans text-sm text-burgundy hover:text-burgundy-light transition-colors"
          >
            See other times →
          </a>
        )}
      </div>
    );
  }

  // has_slots
  return (
    <HasSlotsView
      slots={slots}
      role={role}
      bookingUrlBase={bookingUrlBase}
      venueId={venueId}
      venueName={venueName}
      venueSlug={venueSlug}
      venueResyId={venueResyId}
      date={date}
      partySize={partySize}
      stopIndex={stopIndex}
      startTime={startTime}
      selectedSlot={selectedSlot}
      onSelectSlot={onSelectSlot}
      onSwap={onSwap}
    />
  );
}

function HasSlotsView({
  slots,
  role,
  bookingUrlBase,
  venueId,
  venueName,
  venueSlug,
  venueResyId,
  date,
  partySize,
  stopIndex,
  startTime,
  selectedSlot,
  onSelectSlot,
  onSwap,
}: {
  slots: AvailabilitySlot[];
  role: StopRole;
  bookingUrlBase: string | null;
  venueId: string;
  venueName: string;
  venueSlug: string | null;
  venueResyId: number | null;
  date: string;
  partySize: number;
  stopIndex: number;
  startTime: string;
  selectedSlot: AvailabilitySlot | null;
  onSelectSlot: (slot: AvailabilitySlot | null) => void;
  onSwap?: () => void;
}) {
  const { trackEngagement } = useEngagement();
  const [expanded, setExpanded] = useState(false);
  const deduped = dedupeSlots(slots);
  // Phase 2: slot recommendations anchor to the user's actual startTime,
  // shifted by stop index (stop 0 = startTime, stop 1 = +90min, stop 2+ = +180min).
  const recommended = pickRecommendedSlots(deduped, stopIndex, startTime);
  const hasMore = deduped.length > recommended.length;

  // When collapsed, ensure the selected slot stays visible even if it falls
  // outside the default 4. Swap it into the visible set.
  const displayed = (() => {
    if (expanded) return deduped;
    if (!selectedSlot) return recommended;
    const selectedInRecommended = recommended.some(
      (s) => s.token === selectedSlot.token
    );
    if (selectedInRecommended) return recommended;
    // Replace last recommended with the selected slot
    const patched = [...recommended];
    patched[patched.length - 1] = selectedSlot;
    return patched;
  })();

  const handleSelect = (slot: AvailabilitySlot, position: number) => {
    if (selectedSlot?.token === slot.token) {
      onSelectSlot(null);
      return;
    }
    onSelectSlot(slot);
    trackEngagement(EVENTS.RESERVATION_SLOT_SELECTED, {
      venue_id: venueId,
      venue_name: venueName,
      stop_index: stopIndex,
      stop_role: role,
      slot_time: slot.time,
      slot_position: position,
      from_surface: "availability_slot_grid",
    });
  };

  // Build slot-specific deep-link only when user has selected a time
  let bookingHref: string | null = null;
  let buttonText = "";

  if (selectedSlot && venueSlug && venueResyId) {
    try {
      bookingHref = buildResySlotBookingUrl(
        venueSlug,
        date,
        partySize,
        selectedSlot,
        venueName,
        venueResyId
      );
      buttonText = `Book ${formatSlotTimeForDisplay(selectedSlot.time)} on Resy`;
    } catch (err) {
      // Graceful fallback — malformed token, use venue page URL
      console.error("[StopAvailability] Failed to build slot URL:", err);
      bookingHref = bookingUrlBase;
      buttonText = "Book on Resy";
    }
  }

  // Venue-level Reserve link (right of "Available times"). Distinct from
  // the slot-specific "Book TIME on Resy" pill below, which only shows
  // after the user selects a slot. bookingUrlBase for has_slots is
  // already the date-aware Resy URL from availability-enrichment.
  const reservePlatform = detectBookingPlatform(bookingUrlBase);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-xs tracking-widest uppercase text-muted">
          Available times
        </p>
        {bookingUrlBase && reservePlatform && (
          <a
            href={bookingUrlBase}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEngagement(EVENTS.RESERVATION_CLICKED, {
                venue_id: venueId,
                venue_name: venueName,
                platform: reservePlatform.id,
                stop_index: stopIndex,
                stop_role: role,
                has_slot: true,
                from_surface: "availability_has_slots_header",
              })
            }
            className="font-sans text-sm text-burgundy hover:text-burgundy-light transition-colors"
          >
            {reservePlatform.label} →
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {displayed.map((slot, idx) => (
          <SlotChip
            key={slot.token}
            slot={slot}
            selected={selectedSlot?.token === slot.token}
            onSelect={(s) => handleSelect(s, idx)}
          />
        ))}
      </div>
      {(hasMore || onSwap) && (
        <div className="flex items-center justify-between gap-3">
          <div>
            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="font-sans text-xs text-burgundy hover:underline transition-colors"
              >
                {expanded
                  ? "Show fewer times"
                  : `Show more times (${deduped.length - recommended.length} more)`}
              </button>
            )}
          </div>
          {onSwap && (
            <button
              type="button"
              onClick={onSwap}
              className="font-sans text-xs text-muted hover:text-charcoal transition-colors"
            >
              Swap
            </button>
          )}
        </div>
      )}
      {bookingHref && (
        <div className="pt-1">
          <a
            href={bookingHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEngagement(EVENTS.RESERVATION_CLICKED, {
                venue_id: venueId,
                venue_name: venueName,
                platform: "resy",
                stop_index: stopIndex,
                stop_role: role,
                has_slot: true,
                from_surface: "availability_slot_specific",
                slot_time: selectedSlot?.time,
              })
            }
            className="inline-block px-5 py-2.5 rounded-full bg-burgundy text-cream font-sans text-sm font-medium hover:bg-burgundy-light transition-colors"
          >
            {buttonText}
          </a>
        </div>
      )}
    </div>
  );
}
