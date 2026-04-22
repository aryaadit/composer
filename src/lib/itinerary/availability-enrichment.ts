// Availability enrichment — fetches live Resy availability for each stop
// in a generated itinerary, filters to the user's time block, and
// attempts a swap if a Resy venue has no slots in the block.

import { getResyAvailability } from "@/lib/availability/resy";
import { buildResyBookingUrl } from "@/lib/availability/booking-url";
import { isSlotInBlock } from "@/lib/itinerary/time-blocks";
import { haversineKm } from "@/lib/geo";
import type { TimeBlock } from "@/types";
import type {
  ItineraryStop,
  StopAvailability,
  Venue,
  ItineraryResponse,
} from "@/types";
import type { AvailabilitySlot } from "@/lib/availability/resy";

const RESY_TIMEOUT_MS = 5000;
const MAX_SWAP_CANDIDATES = 3;
const SWAP_RADIUS_KM = 1.6; // ~1 mile

async function fetchResyWithTimeout(
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
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function buildAvailability(
  venue: Venue,
  slots: AvailabilitySlot[],
  timeBlock: TimeBlock,
  date: string,
  partySize: number
): StopAvailability {
  const platform = venue.reservation_platform ?? "none";

  if (platform === "none") {
    return { status: "walk_in", slots: [], bookingUrlBase: null, swapped: false };
  }

  if (platform !== "resy" || !venue.resy_venue_id || !venue.resy_slug) {
    return {
      status: "unconfirmed",
      slots: [],
      bookingUrlBase: venue.reservation_url ?? null,
      swapped: false,
    };
  }

  const filtered = slots
    .filter((s) => isSlotInBlock(s.time, timeBlock))
    .sort((a, b) => a.time.localeCompare(b.time));

  if (filtered.length > 0) {
    return {
      status: "has_slots",
      slots: filtered,
      bookingUrlBase: buildResyBookingUrl(venue.resy_slug, date, partySize),
      swapped: false,
    };
  }

  return {
    status: "no_slots_in_block",
    slots: [],
    bookingUrlBase: buildResyBookingUrl(venue.resy_slug, date, partySize),
    swapped: false,
  };
}

async function attemptSwap(
  originalVenue: Venue,
  stopRole: string,
  candidatePool: Venue[],
  date: string,
  partySize: number,
  timeBlock: TimeBlock,
  alreadyUsed: Set<string>
): Promise<{
  venue: Venue;
  availability: StopAvailability;
  swapped: boolean;
} | null> {
  const candidates = candidatePool
    .filter((v) => {
      if (alreadyUsed.has(v.id)) return false;
      if (v.reservation_platform !== "resy") return false;
      if (!v.resy_venue_id || !v.resy_slug) return false;
      if (!v.stop_roles.some((r) => r === stopRole)) return false;
      const dist = haversineKm(
        originalVenue.latitude,
        originalVenue.longitude,
        v.latitude,
        v.longitude
      );
      return dist <= SWAP_RADIUS_KM;
    })
    .slice(0, MAX_SWAP_CANDIDATES);

  if (candidates.length === 0) return null;

  const results = await Promise.all(
    candidates.map(async (v) => {
      try {
        const slots = await fetchResyWithTimeout(
          v.resy_venue_id!,
          date,
          partySize
        );
        const filtered = slots
          .filter((s) => isSlotInBlock(s.time, timeBlock))
          .sort((a, b) => a.time.localeCompare(b.time));
        return { venue: v, filtered };
      } catch {
        return { venue: v, filtered: [] as AvailabilitySlot[] };
      }
    })
  );

  const winner = results.find((r) => r.filtered.length > 0);
  if (!winner) return null;

  return {
    venue: winner.venue,
    availability: {
      status: "has_slots",
      slots: winner.filtered,
      bookingUrlBase: buildResyBookingUrl(
        winner.venue.resy_slug!,
        date,
        partySize
      ),
      swapped: true,
      swappedFrom: {
        venueId: originalVenue.id,
        venueName: originalVenue.name,
      },
    },
    swapped: true,
  };
}

export async function enrichWithAvailability(
  response: ItineraryResponse,
  date: string,
  partySize: number,
  timeBlock: TimeBlock,
  candidatePool?: Venue[]
): Promise<ItineraryResponse> {
  const usedIds = new Set(response.stops.map((s) => s.venue.id));

  const enrichedStops = await Promise.all(
    response.stops.map(async (stop): Promise<ItineraryStop> => {
      const venue = stop.venue;
      const platform = venue.reservation_platform ?? "none";

      // Skip non-Resy venues
      if (platform === "none") {
        return {
          ...stop,
          availability: {
            status: "walk_in",
            slots: [],
            bookingUrlBase: null,
            swapped: false,
          },
        };
      }

      if (
        platform !== "resy" ||
        !venue.resy_venue_id ||
        !venue.resy_slug
      ) {
        return {
          ...stop,
          availability: {
            status: "unconfirmed",
            slots: [],
            bookingUrlBase: venue.reservation_url ?? null,
            swapped: false,
          },
        };
      }

      // Fetch Resy availability
      let slots: AvailabilitySlot[];
      try {
        slots = await fetchResyWithTimeout(
          venue.resy_venue_id,
          date,
          partySize
        );
      } catch (err) {
        console.error(
          `[availability] Resy timeout/error for ${venue.name} (${venue.id}):`,
          err
        );
        return {
          ...stop,
          availability: {
            status: "unconfirmed",
            slots: [],
            bookingUrlBase: buildResyBookingUrl(
              venue.resy_slug,
              date,
              partySize
            ),
            swapped: false,
          },
        };
      }

      const availability = buildAvailability(
        venue,
        slots,
        timeBlock,
        date,
        partySize
      );

      if (
        availability.status === "no_slots_in_block" &&
        candidatePool
      ) {
        const swapResult = await attemptSwap(
          venue,
          stop.role,
          candidatePool,
          date,
          partySize,
          timeBlock,
          usedIds
        );
        if (swapResult) {
          usedIds.add(swapResult.venue.id);
          return {
            ...stop,
            venue: swapResult.venue,
            curation_note: swapResult.venue.curation_note,
            availability: swapResult.availability,
          };
        }
      }

      return { ...stop, availability };
    })
  );

  return { ...response, stops: enrichedStops };
}
