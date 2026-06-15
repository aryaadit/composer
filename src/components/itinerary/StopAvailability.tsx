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
import { Button } from "@/components/ui/Button";
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
    // Two reasons land in this branch: "no_live_data" (server never
    // fetched — venue's not wired up for live availability) and
    // "fetch_failed" (server tried, fetch rejected). They get
    // different copy registers. Absent reason is treated as
    // "fetch_failed" so legacy saved itineraries serialized before
    // this field stay conservative — the apologetic copy is the
    // safer default than the "doesn't share" claim.
    const reason = availability.reason ?? "fetch_failed";

    let copy: string;
    if (detectedId === "opentable") {
      // OpenTable's been honest about this from day one — they don't
      // publish a live-availability API. Same line regardless of
      // reason. Audit item 6: em dashes removed; reads as two short
      // sentences.
      copy = "OpenTable doesn't share live availability. Book directly.";
    } else if (reason === "no_live_data") {
      // Server never attempted a fetch (data-gate). Tell the truth:
      // we don't have live times for this spot, not "couldn't load".
      // Sentence case, no em dashes — matches the OpenTable line.
      if (detectedId === "resy") {
        copy = "Resy doesn't share live times for this spot. Book directly.";
      } else if (detectedId === "tock") {
        copy = "Tock doesn't share live times for this spot. Book directly.";
      } else {
        copy = "We don't have live times for this spot. Book directly.";
      }
    } else {
      // fetch_failed (or legacy absent reason): we tried, the fetch
      // rejected. Apologetic register.
      if (detectedId === "resy") {
        copy = "Couldn't load times. Check directly on Resy.";
      } else if (detectedId === "tock") {
        copy = "Couldn't load times. Check directly on Tock.";
      } else {
        const name = PLATFORM_NAMES[platform ?? ""] ?? "the venue";
        copy = `Couldn't load times. Check directly on ${name}.`;
      }
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
      {bookingHref && (
        // Audit item 30: routed through Button primitive at pixel
        // parity. size="sm" supplies the exact "px-5 py-2.5 text-sm"
        // recipe; target="_blank" auto-attaches rel="noopener noreferrer"
        // via the primitive.
        <div className="pt-1">
          <Button
            variant="primary"
            size="sm"
            href={bookingHref}
            target="_blank"
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
          >
            {buttonText}
          </Button>
        </div>
      )}
    </div>
  );
}
