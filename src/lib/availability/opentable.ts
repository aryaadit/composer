// OpenTable availability adapter.
//
// OpenTable has no stable public availability API. All known internal
// endpoints require CSRF tokens or session cookies that can't be
// obtained server-side. This adapter returns empty slots with a valid
// fallback URL — the UI deep-links the user to OT to browse there.
//
// For production scale, apply to the OT Affiliate API at
// partner.opentable.com.

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

const cache = new Map<string, { data: unknown; expires: number }>();

function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now())
    return Promise.resolve(entry.data as T);
  return fn().then((data) => {
    cache.set(key, { data, expires: Date.now() + ttlMs });
    return data;
  });
}

export function extractOpenTableSlug(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("opentable.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (
      parts.length >= 2 &&
      (parts[0] === "r" || parts[0] === "restaurant")
    ) {
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

export function buildOpenTableBookingUrl(
  slug: string,
  partySize: number,
  date: string,
  rid: number | null
): string {
  let url = `https://www.opentable.com/r/${slug}?covers=${partySize}&dateTime=${date}T19:00`;
  if (rid) url += `&rid=${rid}`;
  return url;
}
