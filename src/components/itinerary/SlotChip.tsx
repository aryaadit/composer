"use client";

// Single tappable time slot chip. Uses the shared pillClass for
// visual consistency with WhenStep and NeighborhoodPicker pills.
// Shows table type (e.g. "Bar", "Dining Room") as a subtitle when available.

import { pillClass } from "@/lib/styles";
import { formatSlotTimeForDisplay } from "@/lib/itinerary/time-blocks";
import type { AvailabilitySlot } from "@/lib/availability/resy";

interface SlotChipProps {
  slot: AvailabilitySlot;
  selected: boolean;
  onSelect: (slot: AvailabilitySlot) => void;
}

export function SlotChip({ slot, selected, onSelect }: SlotChipProps) {
  const tableType = slot.type?.trim() || null;

  return (
    <button
      type="button"
      onClick={() => onSelect(slot)}
      className={`${pillClass(selected)} ${tableType ? "flex flex-col items-center leading-tight py-1.5" : ""}`}
    >
      <span>{formatSlotTimeForDisplay(slot.time)}</span>
      {tableType && (
        <span className={`text-[10px] ${selected ? "text-cream/70" : "text-muted"}`}>
          {tableType}
        </span>
      )}
    </button>
  );
}

/**
 * Deduplicate slots: when multiple slots share the same display time
 * AND table type, keep only the one with the highest max party size
 * (inferred from the token's party-size segment).
 */
export function dedupeSlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const map = new Map<string, AvailabilitySlot>();

  for (const slot of slots) {
    const displayTime = formatSlotTimeForDisplay(slot.time);
    const type = slot.type?.trim() || "";
    const key = `${displayTime}|${type}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, slot);
    } else {
      // Keep the one with the larger party size from token
      const existingSize = parsePartySizeFromToken(existing.token);
      const newSize = parsePartySizeFromToken(slot.token);
      if (newSize > existingSize) {
        map.set(key, slot);
      }
    }
  }

  // Preserve chronological order
  return slots.filter((s) => {
    const displayTime = formatSlotTimeForDisplay(s.time);
    const type = s.type?.trim() || "";
    const key = `${displayTime}|${type}`;
    return map.get(key) === s;
  });
}

/**
 * Extract party size from rgs:// token.
 * Format: rgs://resy/{venueId}/{templateId}/{partySize}/...
 */
function parsePartySizeFromToken(token: string): number {
  const parts = token.replace("rgs://resy/", "").split("/");
  if (parts.length >= 3) {
    const n = parseInt(parts[2], 10);
    if (!isNaN(n)) return n;
  }
  return 0;
}
