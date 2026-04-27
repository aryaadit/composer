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
import type {
  StopAvailability as StopAvailabilityType,
  StopRole,
} from "@/types";
import type { AvailabilitySlot } from "@/lib/availability/resy";
import type { TimeBlock } from "@/lib/itinerary/time-blocks";

interface StopAvailabilityProps {
  availability: StopAvailabilityType;
  role: StopRole;
  timeBlock: TimeBlock;
  platform: string | null;
  venueName: string;
  venueSlug: string | null;
  venueResyId: number | null;
  date: string;
  partySize: number;
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
  timeBlock,
  platform,
  venueName,
  venueSlug,
  venueResyId,
  date,
  partySize,
  selectedSlot,
  onSelectSlot,
}: StopAvailabilityProps) {
  const { status, slots, bookingUrlBase } = availability;

  // Walk-in status is now shown in StopCard's meta line — no separate badge
  if (status === "walk_in") return null;

  if (status === "unconfirmed") {
    const name = PLATFORM_NAMES[platform ?? ""] ?? "the venue";
    return (
      <div className="mt-3 space-y-2">
        <p className="font-sans text-xs text-muted italic">
          Couldn&apos;t load times — check directly on {name}
        </p>
        {bookingUrlBase && (
          <a
            href={bookingUrlBase}
            target="_blank"
            rel="noopener noreferrer"
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
      timeBlock={timeBlock}
      bookingUrlBase={bookingUrlBase}
      venueName={venueName}
      venueSlug={venueSlug}
      venueResyId={venueResyId}
      date={date}
      partySize={partySize}
      selectedSlot={selectedSlot}
      onSelectSlot={onSelectSlot}
    />
  );
}

function HasSlotsView({
  slots,
  role,
  timeBlock,
  bookingUrlBase,
  venueName,
  venueSlug,
  venueResyId,
  date,
  partySize,
  selectedSlot,
  onSelectSlot,
}: {
  slots: AvailabilitySlot[];
  role: StopRole;
  timeBlock: TimeBlock;
  bookingUrlBase: string | null;
  venueName: string;
  venueSlug: string | null;
  venueResyId: number | null;
  date: string;
  partySize: number;
  selectedSlot: AvailabilitySlot | null;
  onSelectSlot: (slot: AvailabilitySlot | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const deduped = dedupeSlots(slots);
  const recommended = pickRecommendedSlots(deduped, role, timeBlock);
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

  const handleSelect = (slot: AvailabilitySlot) => {
    if (selectedSlot?.token === slot.token) {
      onSelectSlot(null);
    } else {
      onSelectSlot(slot);
    }
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

  return (
    <div className="mt-3 space-y-3">
      <p className="font-sans text-xs tracking-widest uppercase text-muted">
        Available times
      </p>
      <div className="flex flex-wrap gap-2">
        {displayed.map((slot) => (
          <SlotChip
            key={slot.token}
            slot={slot}
            selected={selectedSlot?.token === slot.token}
            onSelect={handleSelect}
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
        <a
          href={bookingHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-1 px-5 py-2.5 rounded-full bg-burgundy text-cream font-sans text-sm font-medium hover:bg-burgundy-light transition-colors"
        >
          {buttonText}
        </a>
      )}
    </div>
  );
}
