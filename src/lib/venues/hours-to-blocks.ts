// Hours-to-blocks mapper for the admin "Add venue" feature.
//
// Google Places returns regularOpeningHours.periods as an array of
// (open, close) pairs keyed by day-of-week. We project those onto
// the canonical TIME_BLOCKS boundaries (morning / afternoon /
// evening / late_night) declared in src/lib/itinerary/time-blocks.ts
// to produce the per-day mon_blocks..sun_blocks arrays the venue
// sheet stores.
//
// IMPORTANT: do not invent new boundary values here. The block
// boundaries are 08:00 / 12:00 / 17:00 / 22:00 / 02:00 — those come
// from TIME_BLOCKS and the rest of the algorithm reads them. A
// venue whose hours overlap [17:00, 22:00] gets `evening`. A bar
// open until 1:30 AM gets `late_night` (the boundary wraps midnight
// to 26:00 in 24-hour float form, matching the formatHour
// convention in src/lib/format/hours.ts).

import { TIME_BLOCKS, type TimeBlock } from "@/lib/itinerary/time-blocks";

const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type DayBlocksMap = Record<DayKey, TimeBlock[]>;

/** Canonical column key for each day's blocks in the sheet. */
export const DAY_COLUMN_BY_KEY: Record<DayKey, string> = {
  mon: "mon_blocks",
  tue: "tue_blocks",
  wed: "wed_blocks",
  thu: "thu_blocks",
  fri: "fri_blocks",
  sat: "sat_blocks",
  sun: "sun_blocks",
};

/** Schedule shape mirroring src/lib/format/hours.ts: floats in 24h
 *  form, past-midnight close uses >24 (e.g. 25.5 = 1:30 AM next day). */
export type Schedule = Partial<Record<DayKey, Array<[number, number]>>>;

interface NumericBlockRange {
  id: TimeBlock;
  start: number;
  end: number;
}

/** Numeric (float-24h) form of TIME_BLOCKS. late_night wraps midnight
 *  so end > 24. Same convention the Schedule type uses for past-midnight
 *  closes — both sides of the overlap check live in the same units. */
const NUMERIC_BLOCKS: NumericBlockRange[] = TIME_BLOCKS.map((b) => {
  const start = parseHHMM(b.range.start);
  let end = parseHHMM(b.range.end);
  if (end <= start) end += 24;
  return { id: b.id, start, end };
});

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h + (m || 0) / 60;
}

function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  // Both intervals are inclusive on the open boundary, exclusive on
  // close. A venue open until 22:00 sharp does not get `late_night`;
  // a bar open until 22:01 does. Strict > / < avoids the
  // boundary-touching false positive (e.g. a brunch spot closing at
  // 12:00 should be `morning`, not `morning + afternoon`).
  return aStart < bEnd && bStart < aEnd;
}

/**
 * For one day's open intervals, return the TimeBlock ids whose
 * canonical ranges overlap. Order matches TIME_BLOCKS (morning,
 * afternoon, evening, late_night) so the resulting per-day array
 * reads chronologically.
 *
 * Past-midnight closes are honored by NUMERIC_BLOCKS.late_night
 * extending to 26h. Open intervals themselves can also reach past
 * 24h (e.g. [22.0, 25.5]) and the same overlap check works.
 */
export function blocksForDayIntervals(
  intervals: Array<[number, number]>,
): TimeBlock[] {
  const hit = new Set<TimeBlock>();
  for (const [open, close] of intervals) {
    // Defensive: skip degenerate intervals (close <= open after
    // adjustment) so a malformed source doesn't get block coverage.
    if (close <= open) continue;
    for (const block of NUMERIC_BLOCKS) {
      if (intervalsOverlap(open, close, block.start, block.end)) {
        hit.add(block.id);
      }
    }
  }
  return TIME_BLOCKS.map((b) => b.id).filter((id) => hit.has(id));
}

/**
 * Project a full-week Schedule onto per-day blocks. Returns a map
 * keyed by day with empty arrays for days the schedule omits or
 * marks closed (empty intervals). The caller serializes these into
 * the sheet's mon_blocks..sun_blocks columns.
 */
export function scheduleToDayBlocks(schedule: Schedule): DayBlocksMap {
  const result = {} as DayBlocksMap;
  for (const day of DAY_KEYS) {
    const intervals = schedule[day] ?? [];
    result[day] = blocksForDayIntervals(intervals);
  }
  return result;
}

/**
 * Global time_blocks = union of all per-day blocks. Matches the
 * hybrid rule in src/lib/itinerary/time-blocks.ts (effectiveBlocksForDay):
 * the global value is used as a fallback when per-day columns are
 * blank, so the safest default is the union of what the venue
 * actually offers across the week.
 */
export function unionTimeBlocks(dayBlocks: DayBlocksMap): TimeBlock[] {
  const hit = new Set<TimeBlock>();
  for (const day of DAY_KEYS) {
    for (const block of dayBlocks[day]) {
      hit.add(block);
    }
  }
  return TIME_BLOCKS.map((b) => b.id).filter((id) => hit.has(id));
}
