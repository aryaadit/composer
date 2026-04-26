// Temporal chain solver — ensures each stop's reservation time leaves
// room for the next (end time + walk ≤ next start). Uses forward-
// checking with backtracking, processed chronologically.
//
// Walk-in stops have no fixed slot — they're scheduled flexibly in
// whatever gap exists between fixed-reservation neighbors.
//
// If no valid full chain exists, returns the longest valid partial
// chain with an explanation of which stop failed.

import { walkTimeMinutes } from "@/lib/geo";
import { ROLE_AVG_DURATION_MIN } from "@/lib/composer";
import type { ScoredVenue, StopRole } from "@/types";
import type { AvailabilitySlot } from "@/lib/availability/resy";

const MAX_CANDIDATES_PER_ROLE = 8;

export interface ChainCandidate {
  venue: ScoredVenue;
  role: StopRole;
  slots: AvailabilitySlot[];
  isWalkIn: boolean;
}

export interface ChainLink {
  candidate: ChainCandidate;
  selectedSlot: AvailabilitySlot | null;
  startMinutes: number;
  endMinutes: number;
}

export interface ChainResult {
  chain: ChainLink[];
  isPartial: boolean;
  failedAtRole?: StopRole;
  failedVenueName?: string;
}

function timeToMinutes(timeStr: string): number {
  const part = timeStr.includes(" ")
    ? timeStr.split(" ")[1].substring(0, 5)
    : timeStr.substring(0, 5);
  const [h, m] = part.split(":").map(Number);
  let mins = h * 60 + m;
  if (mins < 4 * 60) mins += 24 * 60;
  return mins;
}

function walkBetween(a: ScoredVenue, b: ScoredVenue): number {
  return walkTimeMinutes(
    a.latitude, a.longitude,
    b.latitude, b.longitude
  );
}

function durationForRole(role: StopRole): number {
  return ROLE_AVG_DURATION_MIN[role] ?? 60;
}

// Find the earliest slot on this candidate that starts at or after
// `earliestMinutes`. Returns null if no slot fits.
function findEarliestSlot(
  candidate: ChainCandidate,
  earliestMinutes: number
): AvailabilitySlot | null {
  for (const slot of candidate.slots) {
    const slotStart = timeToMinutes(slot.time);
    if (slotStart >= earliestMinutes) return slot;
  }
  return null;
}

// For walk-in stops: check that there's enough time between the
// previous stop's end and the next fixed slot (if any). Walk-ins
// need: walk from prev + duration + walk to next.
function walkInFits(
  prev: ChainLink | null,
  candidate: ChainCandidate,
  windowStartMinutes: number
): { startMinutes: number; endMinutes: number } | null {
  const duration = durationForRole(candidate.role);
  let earliest = windowStartMinutes;

  if (prev) {
    const walk = walkBetween(prev.candidate.venue, candidate.venue);
    earliest = prev.endMinutes + walk;
  }

  return {
    startMinutes: earliest,
    endMinutes: earliest + duration,
  };
}

export function solveChain(
  pattern: StopRole[],
  candidatesPerRole: Map<StopRole, ChainCandidate[]>,
  windowStartMinutes: number,
  windowEndMinutes: number
): ChainResult {
  const chain: ChainLink[] = [];
  let bestPartial: ChainLink[] = [];
  let failedRole: StopRole | undefined;
  let failedVenueName: string | undefined;

  function backtrack(depth: number): boolean {
    if (depth === pattern.length) return true;

    const role = pattern[depth];
    const candidates = candidatesPerRole.get(role) ?? [];
    const usedIds = new Set(chain.map((l) => l.candidate.venue.id));
    const prev = chain.length > 0 ? chain[chain.length - 1] : null;

    for (const candidate of candidates) {
      if (usedIds.has(candidate.venue.id)) continue;

      if (candidate.isWalkIn) {
        const fit = walkInFits(prev, candidate, windowStartMinutes);
        if (!fit) continue;
        if (fit.endMinutes > windowEndMinutes) continue;

        chain.push({
          candidate,
          selectedSlot: null,
          startMinutes: fit.startMinutes,
          endMinutes: fit.endMinutes,
        });

        if (backtrack(depth + 1)) return true;
        chain.pop();
      } else {
        // Fixed-reservation venue — needs a slot that fits after prev
        let earliestStart = windowStartMinutes;
        if (prev) {
          const walk = walkBetween(prev.candidate.venue, candidate.venue);
          earliestStart = prev.endMinutes + walk;
        }

        const slot = findEarliestSlot(candidate, earliestStart);
        if (!slot) continue;

        const slotStart = timeToMinutes(slot.time);
        const slotEnd = slot.endTime
          ? timeToMinutes(slot.endTime)
          : slotStart + durationForRole(candidate.role);

        if (slotEnd > windowEndMinutes + 30) continue;

        chain.push({
          candidate,
          selectedSlot: slot,
          startMinutes: slotStart,
          endMinutes: slotEnd,
        });

        if (backtrack(depth + 1)) return true;
        chain.pop();
      }
    }

    // No candidate worked at this depth — record for partial fallback
    if (chain.length > bestPartial.length) {
      bestPartial = [...chain];
      failedRole = role;
      failedVenueName = candidates[0]?.venue.name;
    }

    return false;
  }

  const solved = backtrack(0);

  if (solved) {
    return { chain, isPartial: false };
  }

  return {
    chain: bestPartial,
    isPartial: true,
    failedAtRole: failedRole,
    failedVenueName,
  };
}

// Trim a candidates list to top-N by score for the solver.
export function topCandidates(
  scored: ScoredVenue[],
  role: StopRole,
  slots: Map<string, AvailabilitySlot[]>,
  timeBlock: string
): ChainCandidate[] {
  return scored.slice(0, MAX_CANDIDATES_PER_ROLE).map((v) => {
    const platform = v.reservation_platform ?? "none";
    const isWalkIn = platform === "none" || !v.resy_venue_id;
    const venueSlots = slots.get(v.id) ?? [];
    return {
      venue: v,
      role,
      slots: venueSlots.sort((a, b) => a.time.localeCompare(b.time)),
      isWalkIn,
    };
  });
}
