// Canonical time blocks module — SINGLE source of truth for everything
// related to time block IDs, labels, ranges, and filtering.
//
// Every file that touches time blocks imports from here. Do not
// duplicate block lists, labels, or range logic elsewhere.

// TimeBlock is defined here (canonical source) and re-exported from @/types.
export type TimeBlock = "morning" | "afternoon" | "evening" | "late_night";

interface BlockRange {
  start: string; // "HH:MM", 24h, NYC local
  end: string; // "HH:MM" — if < start, wraps past midnight
}

export interface BlockMetadata {
  id: TimeBlock;
  label: string; // "Morning"
  shortRange: string; // "8a–12p"
  fullRange: string; // "8:00 AM – 12:00 PM"
  range: BlockRange;
}

export const TIME_BLOCKS: BlockMetadata[] = [
  {
    id: "morning",
    label: "Morning",
    shortRange: "8a\u201312p",
    fullRange: "8:00 AM \u2013 12:00 PM",
    range: { start: "08:00", end: "12:00" },
  },
  {
    id: "afternoon",
    label: "Afternoon",
    shortRange: "12p\u20135p",
    fullRange: "12:00 PM \u2013 5:00 PM",
    range: { start: "12:00", end: "17:00" },
  },
  {
    id: "evening",
    label: "Evening",
    shortRange: "5p\u201310p",
    fullRange: "5:00 PM \u2013 10:00 PM",
    range: { start: "17:00", end: "22:00" },
  },
  {
    id: "late_night",
    label: "Late Night",
    shortRange: "10p\u20132a",
    fullRange: "10:00 PM \u2013 2:00 AM",
    range: { start: "22:00", end: "02:00" },
  },
];

export const DEFAULT_TIME_BLOCK: TimeBlock = "evening";

export function getBlockMetadata(block: TimeBlock): BlockMetadata {
  const meta = TIME_BLOCKS.find((b) => b.id === block);
  if (!meta) throw new Error(`Unknown time block: ${block}`);
  return meta;
}

export function formatBlockChipLabel(block: TimeBlock): string {
  const meta = getBlockMetadata(block);
  return `${meta.label} \u00b7 ${meta.shortRange}`;
}

/**
 * Check if a slot time falls within a time block.
 * @param slotTime "YYYY-MM-DD HH:MM:SS" from Resy (NYC local)
 * @param block TimeBlock identifier
 *
 * Boundary: start-inclusive, end-exclusive.
 * 17:00 = evening, NOT afternoon.
 *
 * Late night handles midnight wrap: 22:00–01:59 = late_night.
 */
export function isSlotInBlock(slotTime: string, block: TimeBlock): boolean {
  const meta = getBlockMetadata(block);
  // Extract HH:MM from "YYYY-MM-DD HH:MM:SS" or "HH:MM"
  const timePart = slotTime.includes(" ")
    ? slotTime.split(" ")[1].substring(0, 5)
    : slotTime.substring(0, 5);

  const { start, end } = meta.range;

  if (start < end) {
    // Normal range (no midnight wrap): start <= time < end
    return timePart >= start && timePart < end;
  }

  // Midnight wrap (late_night): time >= start OR time < end
  return timePart >= start || timePart < end;
}

/**
 * Resolve a time block into start + end HH:MM strings for scoring.
 * Used by the generate route to feed startTime/endTime to the
 * scoring engine.
 */
export function resolveTimeWindow(timeBlock: TimeBlock): {
  startTime: string;
  endTime: string;
} {
  const meta = getBlockMetadata(timeBlock);
  return {
    startTime: meta.range.start,
    endTime: meta.range.end,
  };
}
