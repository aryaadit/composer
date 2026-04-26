// Batch-fetch Resy availability for a set of venue IDs. Called once
// per generation cycle — the chain solver reads from the cache, never
// makes its own API calls.

import { getResyAvailability } from "@/lib/availability/resy";
import { isSlotInBlock } from "@/lib/itinerary/time-blocks";
import type { AvailabilitySlot } from "@/lib/availability/resy";
import type { Venue } from "@/types";
import type { TimeBlock } from "@/lib/itinerary/time-blocks";

const RESY_TIMEOUT_MS = 5000;

async function fetchWithTimeout(
  resyVenueId: number,
  date: string,
  partySize: number
): Promise<AvailabilitySlot[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESY_TIMEOUT_MS);
  try {
    const slots = await getResyAvailability(resyVenueId, date, partySize);
    clearTimeout(timeout);
    return slots;
  } catch {
    clearTimeout(timeout);
    return [];
  }
}

// Fetch availability for all Resy venues in the candidate set.
// Returns Map<venueId, filteredSlots[]>. Non-Resy venues get empty
// arrays — the solver treats them as walk-ins.
export async function batchFetchAvailability(
  venues: Venue[],
  date: string,
  partySize: number,
  timeBlock: TimeBlock
): Promise<Map<string, AvailabilitySlot[]>> {
  const resyVenues = venues.filter(
    (v) => v.reservation_platform === "resy" && v.resy_venue_id
  );

  const results = await Promise.all(
    resyVenues.map(async (v) => {
      const slots = await fetchWithTimeout(v.resy_venue_id!, date, partySize);
      // Dedupe by time and filter to the selected block.
      const seen = new Set<string>();
      const filtered = slots
        .filter((s) => isSlotInBlock(s.time, timeBlock))
        .sort((a, b) => a.time.localeCompare(b.time))
        .filter((s) => {
          if (seen.has(s.time)) return false;
          seen.add(s.time);
          return true;
        });
      return { id: v.id, slots: filtered };
    })
  );

  const cache = new Map<string, AvailabilitySlot[]>();
  for (const r of results) {
    cache.set(r.id, r.slots);
  }
  return cache;
}
