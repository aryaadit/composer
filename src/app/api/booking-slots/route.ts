// GET /api/booking-slots?venueId=UUID&date=YYYY-MM-DD&partySize=N
//
// Unified availability endpoint. Looks up the venue's reservation_url,
// detects the platform, dispatches to the Resy or OpenTable client, and
// returns the normalized BookingAvailability shape.
//
// Returns 200 with empty groups + fallbackUrl on upstream failure —
// never a 500 for a scrape miss. The UI handles empty gracefully.

import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { detectBookingPlatform } from "@/lib/booking";
import { getResyAvailabilityFromUrl } from "@/lib/resy";
import { getOpenTableAvailabilityFromUrl } from "@/lib/opentable";
import type { Venue } from "@/types";

const CACHE_HEADER =
  "public, max-age=60, s-maxage=120, stale-while-revalidate=300";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId");
  const date = searchParams.get("date");
  const partySize = parseInt(searchParams.get("partySize") ?? "2", 10);

  if (!venueId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Missing or malformed params: venueId, date (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (isNaN(partySize) || partySize < 1 || partySize > 20) {
    return NextResponse.json(
      { error: "partySize must be 1–20" },
      { status: 400 }
    );
  }

  const { data: venue, error: venueError } = await getSupabase()
    .from("composer_venues")
    .select("id, name, reservation_url")
    .eq("id", venueId)
    .maybeSingle();

  if (venueError || !venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const typedVenue = venue as Pick<Venue, "id" | "name" | "reservation_url">;

  if (!typedVenue.reservation_url) {
    return NextResponse.json(
      {
        platform: null,
        venueId: typedVenue.id,
        venueName: typedVenue.name,
        date,
        partySize,
        groups: [],
        fallbackUrl: null,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: { "Cache-Control": CACHE_HEADER },
      }
    );
  }

  const platform = detectBookingPlatform(typedVenue.reservation_url);

  if (platform?.id === "resy") {
    const result = await getResyAvailabilityFromUrl(
      typedVenue.reservation_url,
      date,
      partySize
    );
    if (result) {
      result.venueName = typedVenue.name;
      return NextResponse.json(result, {
        headers: { "Cache-Control": CACHE_HEADER },
      });
    }
  }

  if (platform?.id === "opentable") {
    const result = await getOpenTableAvailabilityFromUrl(
      typedVenue.reservation_url,
      date,
      partySize
    );
    if (result) {
      result.venueName = typedVenue.name;
      return NextResponse.json(result, {
        headers: { "Cache-Control": CACHE_HEADER },
      });
    }
  }

  // Unknown platform or failed extraction — return the raw URL as fallback.
  return NextResponse.json(
    {
      platform: platform?.id ?? null,
      venueId: typedVenue.id,
      venueName: typedVenue.name,
      date,
      partySize,
      groups: [],
      fallbackUrl: typedVenue.reservation_url,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: { "Cache-Control": CACHE_HEADER },
    }
  );
}
