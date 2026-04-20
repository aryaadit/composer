// Server-only Resy client. Do NOT import from browser code.
//
// Uses the Resy public widget API. The API key ships in the widget JS
// bundle at widgets.resy.com and is well-known. If 401s start appearing,
// pull the latest from any widgets.resy.com page's JS source.

import type { BookingAvailability, BookingSlotGroup } from "./bookingTypes";

const RESY_KEY =
  process.env.RESY_API_KEY ?? "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";

const HEADERS = {
  Authorization: `ResyAPI api_key="${RESY_KEY}"`,
  "X-Origin": "https://widgets.resy.com",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// Simple in-memory cache keyed by string, with TTL.
const cache = new Map<string, { data: unknown; expires: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.data as T);
  return fn().then((data) => {
    cache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  });
}

export function extractResySlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("resy.com")) return null;
    // /cities/{city}/venues/{slug} or /cities/{city}/{slug}
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[0] === "cities") {
      // Skip "venues" segment if present
      return parts[parts.length - 1];
    }
    return null;
  } catch {
    return null;
  }
}

function extractResyLocation(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "cities") return parts[1];
  } catch {
    // fallthrough
  }
  return "new-york-ny";
}

export async function getResyVenueId(
  slug: string,
  location: string
): Promise<number | null> {
  return cached(`resy-id:${slug}:${location}`, 24 * 60 * 60 * 1000, async () => {
    try {
      const res = await fetch(
        `https://api.resy.com/3/venue?url_slug=${encodeURIComponent(slug)}&location=${encodeURIComponent(location)}`,
        { headers: HEADERS }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.id?.resy ?? null;
    } catch {
      return null;
    }
  });
}

const SERVICE_TYPE_ORDER: Record<string, number> = {
  "dining room": 0,
  "outdoor": 1,
  "patio": 1,
  "terrace": 1,
  "bar": 2,
  "bar room": 2,
  "lounge": 3,
};

function serviceTypeRank(type: string): number {
  return SERVICE_TYPE_ORDER[type.toLowerCase()] ?? 99;
}

export async function getResyAvailability(opts: {
  venueId: number;
  slug: string;
  date: string;
  partySize: number;
  reservationUrl: string;
}): Promise<BookingAvailability> {
  const { venueId, slug, date, partySize } = opts;
  const fallbackUrl = `https://widgets.resy.com/?venueId=${venueId}&date=${date}&seats=${partySize}`;

  const cacheKey = `resy-avail:${venueId}:${date}:${partySize}`;
  return cached(cacheKey, 2 * 60 * 1000, async () => {
    try {
      const url =
        `https://api.resy.com/4/find?lat=0&long=0&day=${date}&party_size=${partySize}&venue_id=${venueId}`;
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        return emptyResult(venueId, slug, date, partySize, fallbackUrl);
      }

      const data = await res.json();
      const rawSlots = data?.results?.venues?.[0]?.slots ?? [];
      const venueName =
        data?.results?.venues?.[0]?.venue?.name ?? slug;

      const groupMap = new Map<string, BookingSlotGroup>();

      for (const slot of rawSlots) {
        const serviceType: string =
          slot?.config?.type ?? "Dining Room";
        const startTime: string = slot?.date?.start ?? "";
        const configId: string = String(slot?.config?.id ?? "");
        const token: string = slot?.config?.token ?? "";

        if (!startTime) continue;

        const timePart = startTime.split(" ")[1]?.slice(0, 5) ?? startTime.slice(11, 16);

        const bookingUrl =
          `https://widgets.resy.com/?venueId=${venueId}&date=${date}&seats=${partySize}&time=${timePart}&configId=${configId}`;

        if (!groupMap.has(serviceType)) {
          groupMap.set(serviceType, { serviceType, slots: [] });
        }
        groupMap.get(serviceType)!.slots.push({
          time: timePart,
          configId,
          token,
          bookingUrl,
        });
      }

      const groups = Array.from(groupMap.values())
        .sort((a, b) => serviceTypeRank(a.serviceType) - serviceTypeRank(b.serviceType));
      for (const g of groups) {
        g.slots.sort((a, b) => a.time.localeCompare(b.time));
      }

      return {
        platform: "resy",
        venueId: String(venueId),
        venueName,
        date,
        partySize,
        groups,
        fallbackUrl,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return emptyResult(venueId, slug, date, partySize, fallbackUrl);
    }
  });
}

function emptyResult(
  venueId: number,
  slug: string,
  date: string,
  partySize: number,
  fallbackUrl: string
): BookingAvailability {
  return {
    platform: "resy",
    venueId: String(venueId),
    venueName: slug,
    date,
    partySize,
    groups: [],
    fallbackUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getResyAvailabilityFromUrl(
  reservationUrl: string,
  date: string,
  partySize: number
): Promise<BookingAvailability | null> {
  const slug = extractResySlug(reservationUrl);
  if (!slug) return null;
  const location = extractResyLocation(reservationUrl);
  const venueId = await getResyVenueId(slug, location);
  if (!venueId) return null;
  return getResyAvailability({ venueId, slug, date, partySize, reservationUrl });
}
