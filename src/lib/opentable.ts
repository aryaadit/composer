// Server-only OpenTable client. Do NOT import from browser code.
//
// ToS note: scraping opentable.com violates their Terms of Service.
// For production scale, apply to the OT Affiliate API at
// partner.opentable.com — they also pay commission on bookings.
// Akamai will rate-limit datacenter IPs (Vercel/Render/Fly); localhost
// is more forgiving. This module always returns a valid fallbackUrl
// so the UI can deep-link the user to OT even when scraping fails.

import type { BookingAvailability } from "./bookingTypes";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

const cache = new Map<string, { data: unknown; expires: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return Promise.resolve(entry.data as T);
  return fn().then((data) => {
    cache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  });
}

export function extractOpenTableSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("opentable.com")) return null;
    // /r/{slug} or /restaurant/{slug}
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[0] === "r" || parts[0] === "restaurant")) {
      return parts[1].split("?")[0];
    }
    return null;
  } catch {
    return null;
  }
}

export async function getOpenTableRid(slug: string): Promise<number | null> {
  return cached(`ot-rid:${slug}`, 24 * 60 * 60 * 1000, async () => {
    try {
      const res = await fetch(`https://www.opentable.com/r/${slug}`, {
        headers: { "User-Agent": MOBILE_UA },
        redirect: "follow",
      });
      if (!res.ok) return null;
      const html = await res.text();

      // Three fallback regexes — ordered by reliability.
      const patterns = [
        /<meta[^>]+(?:ot:rid|rid)[^>]+content="(\d+)"/i,
        /"restaurantId"\s*:\s*(\d+)/,
        /rid=(\d+)/,
      ];
      for (const re of patterns) {
        const m = html.match(re);
        if (m?.[1]) return parseInt(m[1], 10);
      }
      return null;
    } catch {
      return null;
    }
  });
}

function buildFallbackUrl(
  slug: string,
  partySize: number,
  date: string,
  rid: number | null
): string {
  let url = `https://www.opentable.com/r/${slug}?covers=${partySize}&dateTime=${date}T19:00`;
  if (rid) url += `&rid=${rid}`;
  return url;
}

// OpenTable has no stable public availability API. Known internal paths
// tried and documented here for reference:
//   - /dapi/fe/gql — GraphQL, requires CSRF token + session cookie
//   - /api/restaurant/RID/availability — returns 403 from non-browser
//   - /widget/reservation/restaurant-search — widget endpoint, geo-only
// All fail from server-side requests. We return empty groups with a
// valid fallbackUrl — the UI deep-links the user to OT to finish there.
// This is exactly what Beli does for OT venues.

export async function getOpenTableAvailability(opts: {
  slug: string;
  rid: number | null;
  date: string;
  partySize: number;
}): Promise<BookingAvailability> {
  const { slug, rid, date, partySize } = opts;
  const fallbackUrl = buildFallbackUrl(slug, partySize, date, rid);

  return {
    platform: "opentable",
    venueId: rid ? String(rid) : slug,
    venueName: slug
      .split("-")
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" "),
    date,
    partySize,
    groups: [],
    fallbackUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getOpenTableAvailabilityFromUrl(
  reservationUrl: string,
  date: string,
  partySize: number
): Promise<BookingAvailability | null> {
  const slug = extractOpenTableSlug(reservationUrl);
  if (!slug) return null;
  const rid = await getOpenTableRid(slug);
  return getOpenTableAvailability({ slug, rid, date, partySize });
}
