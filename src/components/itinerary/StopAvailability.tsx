"use client";

// Per-stop availability section. Renders one of four states:
// has_slots, walk_in, unconfirmed, no_slots_in_block.

import { useState } from "react";
import { SlotChip } from "./SlotChip";
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

  if (status === "walk_in") {
    return null;
  }

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
  const [showAll, setShowAll] = useState(false);
  const recommended = pickRecommendedSlots(slots, role, timeBlock);
  const displayed = showAll ? slots : recommended;
  const hasMore = slots.length > recommended.length;

  const handleSelect = (slot: AvailabilitySlot) => {
    if (selectedSlot?.token === slot.token) {
      onSelectSlot(null);
    } else {
      onSelectSlot(slot);
    }
  };

  // Build booking URL — slot-specific deep-link if we have a selection,
  // fallback to venue page otherwise.
  let bookingHref = bookingUrlBase;
  let buttonText = "See times on Resy";

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
      buttonText = "See times on Resy";
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
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="font-sans text-xs text-burgundy hover:underline transition-colors"
        >
          Show more times ({slots.length - recommended.length} more)
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
