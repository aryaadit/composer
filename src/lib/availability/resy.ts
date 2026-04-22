// Resy availability adapter.
//
// Calls POST /4/find to get available slots for a venue on a given
// date + party size. The API key is a published client key (same one
// resy.com's frontend uses); no user auth required for reads.
//
// Slot tokens (rgs://...) are opaque — pass through unchanged. They
// encode venue, date, time, and party size, so they can't be reused
// across party size changes.

const RESY_API_URL = "https://api.resy.com/4/find";
const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

export interface AvailabilitySlot {
  time: string; // "2026-05-10 19:15:00" (venue local)
  endTime: string; // "2026-05-10 21:15:00"
  type: string; // e.g. "Lounge", "Dining Room"
  token: string; // rgs://... — pass through for booking
}

interface ResySlot {
  config: {
    token: string;
    type: string;
  };
  date: {
    start: string;
    end: string;
  };
}

interface ResyFindResponse {
  results?: {
    venues?: Array<{
      slots?: ResySlot[];
    }>;
  };
}

export async function getResyAvailability(
  resyVenueId: number,
  date: string,
  partySize: number
): Promise<AvailabilitySlot[]> {
  const res = await fetch(RESY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; ComposerBot/1.0)",
    },
    body: JSON.stringify({
      venue_id: resyVenueId,
      day: date,
      party_size: partySize,
      lat: 0,
      long: 0,
    }),
  });

  if (!res.ok) {
    console.error(`[resy] ${res.status} for venue ${resyVenueId}`);
    return [];
  }

  const data = (await res.json()) as ResyFindResponse;
  const rawSlots = data.results?.venues?.[0]?.slots ?? [];

  return rawSlots.map((slot) => ({
    time: slot.date.start,
    endTime: slot.date.end,
    type: slot.config.type,
    token: slot.config.token,
  }));
}
