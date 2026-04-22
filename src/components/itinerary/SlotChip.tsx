"use client";

// Single tappable time slot chip. Uses the shared pillClass for
// visual consistency with WhenStep and NeighborhoodPicker pills.

import { pillClass } from "@/lib/styles";
import { formatSlotTimeForDisplay } from "@/lib/itinerary/time-blocks";
import type { AvailabilitySlot } from "@/lib/availability/resy";

interface SlotChipProps {
  slot: AvailabilitySlot;
  selected: boolean;
  onSelect: (slot: AvailabilitySlot) => void;
}

export function SlotChip({ slot, selected, onSelect }: SlotChipProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      className={pillClass(selected)}
    >
      {formatSlotTimeForDisplay(slot.time)}
    </button>
  );
}
