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

// ─── Day-of-week filtering ────────────────────────────────────

export type DayColumn =
  | "mon_blocks" | "tue_blocks" | "wed_blocks" | "thu_blocks"
  | "fri_blocks" | "sat_blocks" | "sun_blocks";

const DAY_INDEX_MAP: Record<number, DayColumn> = {
  0: "sun_blocks",
  1: "mon_blocks",
  2: "tue_blocks",
  3: "wed_blocks",
  4: "thu_blocks",
  5: "fri_blocks",
  6: "sat_blocks",
};

/**
 * Map an ISO date (YYYY-MM-DD) to the per-day column name.
 * Parses as local date to match the user's intent.
 */
export function dateToDayColumn(isoDate: string): DayColumn {
  const [y, m, d] = isoDate.split("-").map(Number);
  const localDate = new Date(y, m - 1, d);
  return DAY_INDEX_MAP[localDate.getDay()];
}

/**
 * Returns effective time blocks for a venue on a specific day.
 *
 * Hybrid rule:
 * - If ANY per-day column is populated, trust per-day data.
 *   Empty per-day for the requested day = venue closed that day.
 * - If ALL 7 per-day columns are empty, fall back to global time_blocks.
 */
interface VenueBlocks {
  time_blocks: string[];
  mon_blocks: string[];
  tue_blocks: string[];
  wed_blocks: string[];
  thu_blocks: string[];
  fri_blocks: string[];
  sat_blocks: string[];
  sun_blocks: string[];
}

const ALL_DAY_COLUMNS: DayColumn[] = [
  "mon_blocks", "tue_blocks", "wed_blocks", "thu_blocks",
  "fri_blocks", "sat_blocks", "sun_blocks",
];

export function effectiveBlocksForDay(
  venue: VenueBlocks,
  dayColumn: DayColumn
): string[] {
  const hasAnyPerDayData = ALL_DAY_COLUMNS.some(
    (col) => venue[col]?.length > 0
  );

  if (hasAnyPerDayData) {
    // Trust per-day. Empty for this day = closed.
    return venue[dayColumn] ?? [];
  }

  // No per-day data at all — fall back to global.
  return venue.time_blocks ?? [];
}

/**
 * True if venue is open during the given block on the given day.
 */
export function venueOpenForBlock(
  venue: VenueBlocks,
  dayColumn: DayColumn,
  block: TimeBlock
): boolean {
  const blocks = effectiveBlocksForDay(venue, dayColumn);
  return blocks.includes(block);
}

// ─── Display formatting ───────────────────────────────────────

/**
 * Format a slot time for user display.
 * Input:  "2026-04-25 19:30:00" or "19:30"
 * Output: "7:30 PM"
 */
export function formatSlotTimeForDisplay(slotTime: string): string {
  const timePart = slotTime.includes(" ")
    ? slotTime.split(" ")[1].substring(0, 5)
    : slotTime.substring(0, 5);

  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return m === "00" ? `${h} ${ampm}` : `${h}:${m} ${ampm}`;
}

// ─── Recommended slot selection ───────────────────────────────

import type { StopRole } from "@/types";
import type { AvailabilitySlot } from "@/lib/availability/resy";

// Typical center times by role within each block. Conservative —
// only when there's a clear cultural norm.
const ROLE_CENTERS: Partial<
  Record<TimeBlock, Partial<Record<StopRole, string>>>
> = {
  evening: {
    opener: "18:00",
    main: "19:30",
    closer: "21:00",
  },
  afternoon: {
    opener: "13:00",
    main: "14:00",
    closer: "15:30",
  },
  morning: {
    opener: "09:00",
    main: "10:00",
    closer: "11:00",
  },
  late_night: {
    opener: "22:30",
    main: "23:00",
    closer: "23:30",
  },
};

export function getTypicalTimeForRole(
  role: StopRole,
  block: TimeBlock
): string | null {
  return ROLE_CENTERS[block]?.[role] ?? null;
}

function extractHHMM(slotTime: string): string {
  return slotTime.includes(" ")
    ? slotTime.split(" ")[1].substring(0, 5)
    : slotTime.substring(0, 5);
}

function minuteDistance(timeA: string, timeB: string): number {
  const [ah, am] = timeA.split(":").map(Number);
  const [bh, bm] = timeB.split(":").map(Number);
  return Math.abs(ah * 60 + am - (bh * 60 + bm));
}

/**
 * Pick recommended slots from a venue's full availability list.
 * Clusters around the typical center time for the role if one exists,
 * otherwise returns the first N chronologically.
 */
export function pickRecommendedSlots(
  slots: AvailabilitySlot[],
  role: StopRole,
  block: TimeBlock,
  count = 4
): AvailabilitySlot[] {
  if (slots.length <= count) return slots;

  const center = getTypicalTimeForRole(role, block);
  if (!center) return slots.slice(0, count);

  // Sort by distance from center, take top N, re-sort chronologically
  const scored = slots.map((s) => ({
    slot: s,
    dist: minuteDistance(extractHHMM(s.time), center),
  }));
  scored.sort((a, b) => a.dist - b.dist);
  const picked = scored.slice(0, count).map((s) => s.slot);
  picked.sort((a, b) => a.time.localeCompare(b.time));
  return picked;
}

// ─── Time window resolution ──────────────────────────────────

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
