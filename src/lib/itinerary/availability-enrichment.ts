// Availability enrichment — fetches live Resy availability for each stop
// in a generated itinerary, filters to the user's compose window, and
// attempts a swap if a Resy venue has no slots in the window.

import { getResyAvailability } from "@/lib/availability/resy";
import {
  buildResyBookingUrl,
  buildOpenTableBookingUrl,
} from "@/lib/availability/booking-url";
import { detectBookingPlatform, isValidReservationUrl } from "@/lib/booking";
import {
  isSlotInWindow,
  type TimeWindow,
} from "@/lib/itinerary/time-blocks";
import { haversineKm } from "@/lib/geo";
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

/**
 * Choose the booking URL to expose to the client:
 *   - OpenTable URL → pre-fill date + party via buildOpenTableBookingUrl
 *   - Anything else valid → return as-is
 *   - Invalid / missing → null
 *
 * Single place for the "do we know how to enrich this URL?" decision so
 * the three unconfirmed-branches and the walk_in-rescue branch stay in
 * sync.
 */
function upgradeUrlForPlatform(
  url: string | null | undefined,
  date: string,
  partySize: number,
  startTime: string
): string | null {
  if (!isValidReservationUrl(url)) return null;
  const platform = detectBookingPlatform(url);
  if (platform?.id === "opentable") {
    return buildOpenTableBookingUrl(url, date, partySize, startTime);
  }
  return url;
}

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
  window: TimeWindow,
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
      bookingUrlBase: upgradeUrlForPlatform(
        venue.reservation_url,
        date,
        partySize,
        window.startTime
      ),
      swapped: false,
    };
  }

  const filtered = slots
    .filter((s) => isSlotInWindow(s.time, window))
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
  window: TimeWindow,
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
          .filter((s) => isSlotInWindow(s.time, window))
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
  window: TimeWindow,
  candidatePool?: Venue[]
): Promise<ItineraryResponse> {
  const { startTime } = window;
  const usedIds = new Set(response.stops.map((s) => s.venue.id));

  const enrichedStops = await Promise.all(
    response.stops.map(async (stop): Promise<ItineraryStop> => {
      const venue = stop.venue;
      const platform = venue.reservation_platform ?? "none";

      // Skip non-Resy venues — but rescue OpenTable venues whose
      // reservation_platform is null (60 such rows in the DB as of
      // 2026-05-30). detectBookingPlatform reads the URL, so a venue
      // with reservation_url=opentable.com/... still surfaces a booking
      // link instead of silently routing to walk_in.
      if (platform === "none") {
        const detected = detectBookingPlatform(venue.reservation_url);
        if (detected?.id === "opentable") {
          return {
            ...stop,
            availability: {
              status: "unconfirmed",
              slots: [],
              bookingUrlBase: upgradeUrlForPlatform(
                venue.reservation_url,
                date,
                partySize,
                startTime
              ),
              swapped: false,
            },
          };
        }
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
            bookingUrlBase: upgradeUrlForPlatform(
              venue.reservation_url,
              date,
              partySize,
              startTime
            ),
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
        window,
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
          window,
          usedIds
        );
        if (swapResult) {
          usedIds.add(swapResult.venue.id);
          return {
            ...stop,
            venue: swapResult.venue,
            curation_note: swapResult.venue.curation_note ?? "",
            availability: swapResult.availability,
          };
        }
      }

      return { ...stop, availability };
    })
  );

  return { ...response, stops: enrichedStops };
}
