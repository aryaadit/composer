// Availability dispatcher. Reads a venue's reservation_platform from
// the DB and routes to the appropriate adapter. Returns a uniform
// shape regardless of platform.

import { getSupabase } from "@/lib/supabase";
import { getResyAvailability } from "./resy";
import { buildResyBookingUrl } from "./booking-url";
import {
  extractOpenTableSlug,
  buildOpenTableBookingUrl,
  getOpenTableRid,
} from "./opentable";
import type { AvailabilitySlot } from "./resy";

export type { AvailabilitySlot };

export interface VenueAvailability {
  venueId: string;
  platform: string;
  venueName: string;
  slots: AvailabilitySlot[];
  bookingUrl: string | null;
}

interface VenueRow {
  id: string;
  name: string;
  reservation_platform: string | null;
  reservation_url: string | null;
  resy_venue_id: number | null;
  resy_slug: string | null;
}

export async function getVenueAvailability(
  venueId: string,
  date: string,
  partySize: number
): Promise<VenueAvailability> {
  const { data, error } = await getSupabase()
    .from("composer_venues")
    .select(
      "id, name, reservation_platform, reservation_url, resy_venue_id, resy_slug"
    )
    .eq("id", venueId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Venue not found");
  }

  const venue = data as VenueRow;
  const platform = venue.reservation_platform ?? "none";

  if (platform === "resy" && venue.resy_venue_id && venue.resy_slug) {
    const slots = await getResyAvailability(
      venue.resy_venue_id,
      date,
      partySize
    );
    const bookingUrl = buildResyBookingUrl(venue.resy_slug, date, partySize);
    return {
      venueId: venue.id,
      platform: "resy",
      venueName: venue.name,
      slots,
      bookingUrl,
    };
  }

  // OpenTable — no live slots, but build a proper deep-link
  if (platform === "opentable" && venue.reservation_url) {
    const slug = extractOpenTableSlug(venue.reservation_url);
    if (slug) {
      const rid = await getOpenTableRid(slug);
      const bookingUrl = buildOpenTableBookingUrl(slug, partySize, date, rid);
      return {
        venueId: venue.id,
        platform: "opentable",
        venueName: venue.name,
        slots: [],
        bookingUrl,
      };
    }
  }

  // Other platforms or 'none' — return empty slots with fallback URL
  return {
    venueId: venue.id,
    platform,
    venueName: venue.name,
    slots: [],
    bookingUrl: venue.reservation_url ?? null,
  };
}
