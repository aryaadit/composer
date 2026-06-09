// Canonical time module — SINGLE source of truth for everything related
// to time blocks (venue-side) and time windows (user-side).
//
// As of Phase 1 (evening-only): the user picks a `startTime` from the
// COMPOSE_START_TIMES set. The server derives an `endTime` = startTime
// + 5 hours (wrapping past midnight). All algorithm filters/scores work
// from the [startTime, endTime] window. The TimeBlock concept is
// retained as an INTERNAL venue-side type — venues advertise open hours
// via `time_blocks` / `mon_blocks` columns whose values are TimeBlock
// IDs (morning/afternoon/evening/late_night). The algorithm translates
// between the user window and venue blocks at filter time.
//
// Do not import TimeBlock at the user-input layer (QuestionnaireAnswers,
// GenerateRequestBody). Boundary discipline: TimeBlock stays internal.

// ─── Venue-side: TimeBlock (internal) ────────────────────────────

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
    shortRange: "8a–12p",
    fullRange: "8:00 AM – 12:00 PM",
    range: { start: "08:00", end: "12:00" },
  },
  {
    id: "afternoon",
    label: "Afternoon",
    shortRange: "12p–5p",
    fullRange: "12:00 PM – 5:00 PM",
    range: { start: "12:00", end: "17:00" },
  },
  {
    id: "evening",
    label: "Evening",
    shortRange: "5p–10p",
    fullRange: "5:00 PM – 10:00 PM",
    range: { start: "17:00", end: "22:00" },
  },
  {
    id: "late_night",
    label: "Late Night",
    shortRange: "10p–2a",
    fullRange: "10:00 PM – 2:00 AM",
    range: { start: "22:00", end: "02:00" },
  },
];

export function getBlockMetadata(block: TimeBlock): BlockMetadata {
  const meta = TIME_BLOCKS.find((b) => b.id === block);
  if (!meta) throw new Error(`Unknown time block: ${block}`);
  return meta;
}

// ─── User-side: ComposeStartTime + windows ───────────────────────

export const COMPOSE_START_TIMES = [
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
] as const;
export type ComposeStartTime = (typeof COMPOSE_START_TIMES)[number];

export function isComposeStartTime(value: unknown): value is ComposeStartTime {
  return (
    typeof value === "string" &&
    (COMPOSE_START_TIMES as readonly string[]).includes(value)
  );
}

export interface TimeWindow {
  startTime: string;
  endTime: string;
}

/**
 * Add hours to an HH:MM time, wrapping past midnight. The result wraps
 * once max — adding 25 hours collapses to 1 hour (we never need more
 * than 5 in practice, but the wrap math handles any case correctly).
 */
function addHoursWithWrap(startTime: string, hours: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = (h + hours) * 60 + m;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const outH = Math.floor(wrapped / 60);
  const outM = wrapped % 60;
  return `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
}

const COMPOSE_WINDOW_HOURS = 5;

/**
 * Resolve a startTime into a 5-hour window. The end wraps past midnight
 * for late starts (21:00 → 02:00). All downstream filters and scorers
 * consume the window, not the categorical block.
 */
export function resolveTimeWindow(startTime: string): TimeWindow {
  return {
    startTime,
    endTime: addHoursWithWrap(startTime, COMPOSE_WINDOW_HOURS),
  };
}

/**
 * Backward-compat shim for saved itineraries whose stored `time_block`
 * column predates this refactor. Maps the categorical block to a
 * sensible default startTime for display. Saved itineraries aren't
 * re-generated through the algorithm — this is purely so the saved
 * view can render without crashing on legacy data.
 */
export function startTimeFromLegacyBlock(
  block: string | null | undefined
): string {
  switch (block) {
    case "morning":
      return "09:00";
    case "afternoon":
      return "13:00";
    case "late_night":
      return "22:00";
    case "evening":
    default:
      return "19:00";
  }
}

/**
 * Format a startTime as a user-facing label. "17:00" → "5 PM".
 */
export function formatStartTimeLabel(startTime: string): string {
  const [hStr, mStr] = startTime.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return m === "00" ? `${h} ${ampm}` : `${h}:${m} ${ampm}`;
}

/**
 * Format a window as "5 PM – 10 PM" or "7 PM – Midnight" (the end is
 * always 5 hours later; midnight is the common pretty case).
 */
export function formatWindowLabel(window: TimeWindow): string {
  const start = formatStartTimeLabel(window.startTime);
  if (window.endTime === "00:00") return `${start} – Midnight`;
  return `${start} – ${formatStartTimeLabel(window.endTime)}`;
}

// ─── Range overlap (window-vs-block) ─────────────────────────────

/**
 * True if two HH:MM ranges overlap on a 24-hour clock. Either range
 * may wrap past midnight (end <= start means [start, 24:00) ∪ [00:00, end)).
 *
 * Used to check whether a venue's time-block range overlaps the user's
 * compose window — the core of the new window-based venue filter.
 */
function doRangesOverlap(a: BlockRange, b: BlockRange): boolean {
  const toMin = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const aStart = toMin(a.start);
  const aEnd = toMin(a.end);
  const bStart = toMin(b.start);
  const bEnd = toMin(b.end);

  // Expand each range to a 48-hour interval [start, end + (wraps ? 24h : 0)]
  // so wrapping ranges become a single contiguous segment.
  const aLo = aStart;
  const aHi = aEnd <= aStart ? aEnd + 24 * 60 : aEnd;
  const bLo = bStart;
  const bHi = bEnd <= bStart ? bEnd + 24 * 60 : bEnd;

  // Standard interval overlap: max(starts) < min(ends).
  // We also need to handle the case where one wraps and the other doesn't —
  // shift one by 24h and retry.
  if (Math.max(aLo, bLo) < Math.min(aHi, bHi)) return true;
  // Re-test with b shifted +24h (covers cases where a wraps past midnight
  // and b's morning slice should match a's late-night tail).
  if (Math.max(aLo, bLo + 24 * 60) < Math.min(aHi, bHi + 24 * 60)) return true;
  return false;
}

// ─── Day-of-week filtering ────────────────────────────────────

export type DayColumn =
  | "mon_blocks"
  | "tue_blocks"
  | "wed_blocks"
  | "thu_blocks"
  | "fri_blocks"
  | "sat_blocks"
  | "sun_blocks";

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
  "mon_blocks",
  "tue_blocks",
  "wed_blocks",
  "thu_blocks",
  "fri_blocks",
  "sat_blocks",
  "sun_blocks",
];

/**
 * Returns effective time blocks for a venue on a specific day.
 *
 * Implements the hybrid per-day/global rule:
 * - If ANY of the 7 per-day columns has data, trust per-day data.
 *   An empty per-day array for the requested day means "closed that day."
 * - If ALL 7 per-day columns are empty, fall back to global time_blocks.
 */
export function effectiveBlocksForDay(
  venue: VenueBlocks,
  dayColumn: DayColumn
): string[] {
  const hasAnyPerDayData = ALL_DAY_COLUMNS.some(
    (col) => venue[col]?.length > 0
  );

  if (hasAnyPerDayData) {
    return venue[dayColumn] ?? [];
  }

  return venue.time_blocks ?? [];
}

/**
 * True if the venue has at least one effective block on the given day
 * that overlaps the user's window. Replaces the prior block-based
 * `venueOpenForBlock`.
 */
export function venueOpenForWindow(
  venue: VenueBlocks,
  dayColumn: DayColumn,
  window: TimeWindow
): boolean {
  const venueBlockIds = effectiveBlocksForDay(venue, dayColumn);
  if (venueBlockIds.length === 0) return false;
  const userRange: BlockRange = { start: window.startTime, end: window.endTime };
  return venueBlockIds.some((id) => {
    const meta = TIME_BLOCKS.find((b) => b.id === id);
    return meta ? doRangesOverlap(meta.range, userRange) : false;
  });
}

/**
 * Score a venue's time-window coverage as a 0–1 fraction. Replaces the
 * prior block-based `blockCoverageFraction`. The 1.0 / 0.5 / 0.0 tiers
 * are preserved: 1.0 = covered in BOTH per-day and global, 0.5 = either,
 * 0.0 = neither.
 */
export function windowCoverageFraction(
  venue: VenueBlocks,
  dayColumn: DayColumn,
  window: TimeWindow
): number {
  const userRange: BlockRange = { start: window.startTime, end: window.endTime };
  const overlapsAny = (blockIds: string[]): boolean =>
    blockIds.some((id) => {
      const meta = TIME_BLOCKS.find((b) => b.id === id);
      return meta ? doRangesOverlap(meta.range, userRange) : false;
    });

  const inGlobal = overlapsAny(venue.time_blocks ?? []);
  const inPerDay = overlapsAny(venue[dayColumn] ?? []);
  if (inGlobal && inPerDay) return 1.0;
  if (inGlobal || inPerDay) return 0.5;
  return 0.0;
}

// ─── Slot-vs-window check (Resy slot filtering) ──────────────────

/**
 * True if a Resy slot time (NYC local) falls inside the user's window.
 * Boundary: start-inclusive, end-exclusive. Handles midnight wrap when
 * window.endTime <= window.startTime.
 *
 * @param slotTime "YYYY-MM-DD HH:MM:SS" from Resy, or "HH:MM"
 */
export function isSlotInWindow(slotTime: string, window: TimeWindow): boolean {
  const timePart = slotTime.includes(" ")
    ? slotTime.split(" ")[1].substring(0, 5)
    : slotTime.substring(0, 5);
  const toMin = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  const slot = toMin(timePart);
  const start = toMin(window.startTime);
  const end = toMin(window.endTime);

  if (end > start) {
    return slot >= start && slot < end;
  }
  // Wrap: window crosses midnight.
  return slot >= start || slot < end;
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

// Typical center times by role within each block. Conservative — only
// when there's a clear cultural norm. Phase 1 callers hardcode "evening"
// (per design decision 4); start-time-aware centers are backlogged.
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
 *
 * Phase 1: callers pass `"evening"` as the block. Phase 2 will refactor
 * to use the user's startTime directly.
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

  const scored = slots.map((s) => ({
    slot: s,
    dist: minuteDistance(extractHHMM(s.time), center),
  }));
  scored.sort((a, b) => a.dist - b.dist);
  const picked = scored.slice(0, count).map((s) => s.slot);
  picked.sort((a, b) => a.time.localeCompare(b.time));
  return picked;
}
